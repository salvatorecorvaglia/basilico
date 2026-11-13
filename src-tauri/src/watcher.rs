use crate::state::AppState;
use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoChangedPayload {
    pub repo_path: String,
    /// True when HEAD or a ref moved — a commit, checkout, fetch, reset, … made
    /// outside Basilico. Only then does the commit log need reloading; a plain
    /// file save changes status alone.
    pub refs_changed: bool,
}

/// Start watching a repository. Each directory is registered non-recursively so
/// nested ignore rules avoid consuming watches for dependency/build trees.
pub fn start_watching(app: AppHandle, repo_path: String, watcher_id: String) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut debouncer = loop {
            if app
                .state::<AppState>()
                .get_watcher_id(&repo_path)
                .as_deref()
                != Some(&watcher_id)
            {
                return;
            }
            match new_debouncer(Duration::from_millis(500), tx.clone()) {
                Ok(watcher) => break watcher,
                Err(error) => {
                    log::warn!("Failed to create watcher: {}", error);
                    let _ = app.emit(
                        "repo:watcher-status",
                        WatcherStatus {
                            repo_path: repo_path.clone(),
                            degraded: true,
                        },
                    );
                    std::thread::sleep(Duration::from_secs(1));
                }
            }
        };
        let root = Path::new(&repo_path);
        let git_dirs = resolve_git_dirs(root);
        let mut watched = HashMap::new();
        let mut degraded = reconcile(debouncer.watcher(), root, &git_dirs, &mut watched);
        let mut driver_error = false;
        let mut last_scan = std::time::Instant::now();
        loop {
            if app
                .state::<AppState>()
                .get_watcher_id(&repo_path)
                .as_deref()
                != Some(&watcher_id)
            {
                break;
            }
            let mut structural = false;
            let incoming = rx.recv_timeout(Duration::from_secs(1));
            if app
                .state::<AppState>()
                .get_watcher_id(&repo_path)
                .as_deref()
                != Some(&watcher_id)
            {
                break;
            }
            match incoming {
                Ok(Ok(events)) => {
                    let repo = git2::Repository::open(root).ok();
                    structural = events.iter().any(|e| {
                        e.path.is_dir()
                            || watched.contains_key(&e.path)
                            || matches!(
                                e.path.file_name().and_then(|n| n.to_str()),
                                Some(".gitignore" | "exclude" | "index" | "config")
                            )
                    });
                    if events
                        .iter()
                        .any(|e| is_significant_event(&e.path, root, &git_dirs, repo.as_ref()))
                    {
                        let _ = app.emit(
                            "repo:changed",
                            RepoChangedPayload {
                                repo_path: repo_path.clone(),
                                refs_changed: events
                                    .iter()
                                    .any(|e| is_ref_change(&e.path, &git_dirs)),
                            },
                        );
                    }
                }
                Ok(Err(e)) => {
                    log::warn!("Watcher error: {:?}", e);
                    driver_error = true;
                    degraded = true;
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            // Periodic reconciliation also repairs a directory deleted and
            // recreated between coalesced events, and retries failed watches.
            if structural
                || last_scan.elapsed() >= Duration::from_secs(if degraded { 10 } else { 30 })
            {
                if driver_error {
                    match new_debouncer(Duration::from_millis(500), tx.clone()) {
                        Ok(replacement) => {
                            debouncer = replacement;
                            watched.clear();
                            driver_error = false;
                        }
                        Err(error) => log::warn!("Failed to restart watcher: {}", error),
                    }
                }
                degraded =
                    reconcile(debouncer.watcher(), root, &git_dirs, &mut watched) || driver_error;
                last_scan = std::time::Instant::now();
            }
            let _ = app.emit(
                "repo:watcher-status",
                WatcherStatus {
                    repo_path: repo_path.clone(),
                    degraded,
                },
            );
        }
    });
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatcherStatus {
    repo_path: String,
    degraded: bool,
}

#[derive(PartialEq, Eq)]
struct DirectoryIdentity {
    #[cfg(unix)]
    dev: u64,
    #[cfg(unix)]
    ino: u64,
    #[cfg(not(unix))]
    created: Option<std::time::SystemTime>,
}
fn directory_identity(path: &Path) -> Option<DirectoryIdentity> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return None;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Some(DirectoryIdentity {
            dev: metadata.dev(),
            ino: metadata.ino(),
        })
    }
    #[cfg(not(unix))]
    {
        Some(DirectoryIdentity {
            created: metadata.created().ok(),
        })
    }
}

fn watch_plan(root: &Path, git_dirs: &[PathBuf]) -> (HashMap<PathBuf, DirectoryIdentity>, bool) {
    let repo = git2::Repository::open(root).ok();
    // Ignore rules don't exempt tracked files. Retain their parent watches even
    // when someone force-added a file under an ignored directory.
    let mut tracked_dirs = HashSet::new();
    let mut degraded = repo.is_none();
    if let Some(index) = repo.as_ref().and_then(|r| r.index().ok()) {
        for entry in index.iter() {
            if tracked_dirs.len() >= 10_000 {
                degraded = true;
                break;
            }
            if let Ok(path) = std::str::from_utf8(&entry.path) {
                let mut parent = Path::new(path).parent();
                while let Some(p) = parent {
                    tracked_dirs.insert(root.join(p));
                    parent = p.parent();
                }
            }
        }
    }
    let mut pending = vec![(root.to_path_buf(), 0usize, false)];
    pending.extend(git_dirs.iter().cloned().map(|p| (p, 0, true)));
    let mut paths = HashMap::new();
    while let Some((path, depth, metadata)) = pending.pop() {
        if paths.contains_key(&path) {
            continue;
        }
        if paths.len() >= 10_000 || depth > 64 {
            degraded = true;
            continue;
        }
        let Some(identity) = directory_identity(&path) else {
            degraded = true;
            continue;
        };
        paths.insert(path.clone(), identity);
        match std::fs::read_dir(&path) {
            Ok(entries) => {
                for entry in entries {
                    let Ok(entry) = entry else {
                        degraded = true;
                        continue;
                    };
                    let Ok(kind) = entry.file_type() else {
                        degraded = true;
                        continue;
                    };
                    if !kind.is_dir() || kind.is_symlink() {
                        continue;
                    }
                    let child = entry.path();
                    let name = entry.file_name();
                    if metadata {
                        if matches!(name.to_str(), Some("objects" | "lfs" | "modules")) {
                            continue;
                        }
                    } else if name == ".git"
                        || (is_ignored(&child, root, repo.as_ref())
                            && !tracked_dirs.contains(&child))
                    {
                        continue;
                    }
                    if pending.len() + paths.len() >= 10_000 {
                        degraded = true;
                        continue;
                    }
                    pending.push((child, depth + 1, metadata));
                }
            }
            Err(_) => degraded = true,
        }
    }
    (paths, degraded)
}

fn reconcile(
    watcher: &mut (impl notify::Watcher + ?Sized),
    root: &Path,
    git_dirs: &[PathBuf],
    watched: &mut HashMap<PathBuf, DirectoryIdentity>,
) -> bool {
    let (desired, mut degraded) = watch_plan(root, git_dirs);
    watched.retain(|path, identity| {
        if desired.get(path) == Some(identity) {
            true
        } else {
            let _ = watcher.unwatch(path);
            false
        }
    });
    for (path, identity) in desired {
        if watched.contains_key(&path) {
            continue;
        }
        match watcher.watch(&path, RecursiveMode::NonRecursive) {
            Ok(()) => {
                watched.insert(path, identity);
            }
            Err(e) => {
                degraded = true;
                log::warn!("Failed to watch {}: {}", path.display(), e);
                #[cfg(test)]
                eprintln!("Failed to watch {}: {}", path.display(), e);
            }
        }
    }
    degraded
}

/// Whether `path` (inside `repo_root`) is ignored, judged on its path
/// *relative to the repository root*.
///
/// With the repository available its own ignore rules decide. The
/// conventional name list is only a fallback for when it cannot be opened.
fn is_ignored(path: &Path, repo_root: &Path, repo: Option<&git2::Repository>) -> bool {
    let Ok(relative) = path.strip_prefix(repo_root) else {
        return false;
    };
    match repo {
        Some(repo) => repo.is_path_ignored(relative).unwrap_or(false),
        None => relative
            .components()
            .any(|c| is_conventionally_ignored(&c.as_os_str().to_string_lossy())),
    }
}

/// The git directories worth watching for a repository at `repo_path`.
///
/// For a normal repository this is just `.git`. For a linked worktree it is the
/// worktree's own git directory *and* the shared common directory, since refs
/// live in the latter while `HEAD` lives in the former.
pub fn resolve_git_dirs(repo_path: &Path) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();

    match git2::Repository::open(repo_path) {
        Ok(repo) => {
            dirs.push(repo.path().to_path_buf());
            let common = repo.commondir().to_path_buf();
            if !dirs.contains(&common) {
                dirs.push(common);
            }
        }
        Err(_) => {
            // Fall back to the conventional layout if the repository cannot be
            // opened (e.g. it was removed between opening and watching).
            let fallback = repo_path.join(".git");
            if fallback.is_dir() {
                dirs.push(fallback);
            }
        }
    }

    dirs
}

/// Fallback for when the repository cannot be opened to consult its ignore
/// rules. Conventional build/dependency directory names only — the real
/// decision belongs to git.
pub fn is_conventionally_ignored(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | "target"
            | "dist"
            | "build"
            | "out"
            | "vendor"
            | "coverage"
            | "tmp"
            | "storage"
            | ".next"
            | ".turbo"
            | ".cache"
            | ".idea"
            | ".vscode"
            | ".venv"
            | "venv"
            | "__pycache__"
            | "Pods"
            | "bin"
            | "obj"
    )
}

/// Returns false for editor and git transient files that never warrant a
/// refresh (swap files, `index.lock`, object writes, …).
///
/// This is purely about the file itself. Whether a path is *ignored* depends
/// on where the repository is and what it ignores, which is
/// [`is_significant_event`]'s job: checking ignore names against every
/// component of an absolute path here meant a repository that merely lived
/// under `~/build/` or `/tmp/` never refreshed, and committed source under
/// `src/bin/` was dropped too.
pub fn is_significant_path(path_str: &str) -> bool {
    let path = Path::new(path_str);

    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
        if file_name == ".DS_Store"
            || file_name == "index.lock"
            || file_name == "FETCH_HEAD"
            || file_name.ends_with(".swp")
            || file_name.ends_with('~')
        {
            return false;
        }
    }

    let normalized = path_str.replace('\\', "/");
    !normalized.contains(".git/objects/")
}

/// Whether a watcher event at `path` should trigger a refresh.
///
/// Anything inside the git directories counts (refs, HEAD, the index) apart
/// from transient files. In the working tree, a path counts unless the
/// repository ignores it — judged relative to `repo_root`, so the directories
/// the repository happens to live under play no part.
pub fn is_significant_event(
    path: &Path,
    repo_root: &Path,
    git_dirs: &[PathBuf],
    repo: Option<&git2::Repository>,
) -> bool {
    if !is_significant_path(&path.to_string_lossy()) {
        return false;
    }
    if git_dirs.iter().any(|dir| path.starts_with(dir)) {
        return true;
    }
    if let (Some(repo), Ok(relative)) = (repo, path.strip_prefix(repo_root)) {
        // Directory watchers can report the working-tree root itself. It is
        // significant, but is not an index entry: git2 panics on an empty
        // repository-relative path instead of returning None.
        if !relative
            .components()
            .any(|part| matches!(part, std::path::Component::Normal(_)))
        {
            return true;
        }
        if repo
            .index()
            .ok()
            .is_some_and(|index| index.get_path(relative, 0).is_some())
        {
            return true;
        }
    }
    !is_ignored(path, repo_root, repo)
}

/// Whether an event inside a git directory means HEAD or a ref moved.
pub fn is_ref_change(path: &Path, git_dirs: &[PathBuf]) -> bool {
    git_dirs.iter().any(|dir| {
        let Ok(relative) = path.strip_prefix(dir) else {
            return false;
        };
        relative.starts_with("refs")
            || relative == Path::new("HEAD")
            || relative == Path::new("packed-refs")
    })
}

#[cfg(test)]
mod reconciliation_tests {
    use super::*;

    #[test]
    fn nested_ignores_refresh_and_force_tracked_files_are_retained() {
        let dir = crate::test_utils::TempRepo::new();
        let repo = git2::Repository::init(dir.path.as_path()).unwrap();
        std::fs::create_dir_all(dir.path.as_path().join("src/cache/deep")).unwrap();
        std::fs::write(dir.path.as_path().join("src/.gitignore"), "cache/\n").unwrap();
        let git_dirs = resolve_git_dirs(dir.path.as_path());
        let (paths, degraded) = watch_plan(dir.path.as_path(), &git_dirs);
        assert!(!degraded);
        assert!(paths.contains_key(&dir.path.as_path().join("src")));
        assert!(!paths.contains_key(&dir.path.as_path().join("src/cache")));
        std::fs::write(dir.path.as_path().join("src/.gitignore"), "").unwrap();
        assert!(watch_plan(dir.path.as_path(), &git_dirs)
            .0
            .contains_key(&dir.path.as_path().join("src/cache/deep")));
        std::fs::write(dir.path.as_path().join("src/cache/deep/tracked"), "tracked").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("src/cache/deep/tracked")).unwrap();
        index.write().unwrap();
        std::fs::write(dir.path.as_path().join("src/.gitignore"), "cache/\n").unwrap();
        assert!(watch_plan(dir.path.as_path(), &git_dirs)
            .0
            .contains_key(&dir.path.as_path().join("src/cache/deep")));
    }

    #[test]
    fn recreated_directory_is_registered_and_delivers_file_changes() {
        let dir = crate::test_utils::TempRepo::new();
        git2::Repository::init(dir.path.as_path()).unwrap();
        let path = dir.path.as_path().join("src");
        std::fs::create_dir(&path).unwrap();
        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |event| {
            let _ = tx.send(event);
        })
        .unwrap();
        let mut watched = HashMap::new();
        let git_dirs = resolve_git_dirs(dir.path.as_path());
        assert!(!reconcile(
            &mut watcher,
            dir.path.as_path(),
            &git_dirs,
            &mut watched
        ));
        // Keep the original inode alive to guarantee a distinct identity.
        std::fs::rename(&path, dir.path.as_path().join("old")).unwrap();
        std::fs::create_dir(&path).unwrap();
        assert!(!reconcile(
            &mut watcher,
            dir.path.as_path(),
            &git_dirs,
            &mut watched
        ));
        while rx.try_recv().is_ok() {}
        let file = path.join("observed.txt");
        std::fs::write(&file, "changed").unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut observed = false;
        while std::time::Instant::now() < deadline {
            if let Ok(Ok(event)) = rx.recv_timeout(Duration::from_millis(100)) {
                if event.paths.contains(&file) {
                    observed = true;
                    break;
                }
            }
        }
        assert!(observed, "recreated directory must deliver file events");
    }
}
