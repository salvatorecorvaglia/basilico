use crate::state::AppState;
use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use serde::Serialize;
use std::collections::HashSet;
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

/// Start watching a repository for file changes.
/// Emits "repo:changed" events to the frontend with debouncing.
pub fn start_watching(app: AppHandle, repo_path: String, watcher_id: String) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(e) => {
                log::error!("Failed to create watcher: {}", e);
                return;
            }
        };

        let watch_path = Path::new(&repo_path);
        let git_dirs = resolve_git_dirs(watch_path);

        // Opened once and kept for the life of the watcher: it answers the
        // "is this path gitignored?" question for every event, not just for
        // the directories registered up front.
        let ignore_repo = git2::Repository::open(watch_path).ok();

        // Top-level directories already registered recursively, so a directory
        // created later can be added exactly once.
        let mut watched_dirs: HashSet<PathBuf> = HashSet::new();

        // Registration failures are logged rather than discarded. On Linux,
        // exhausting `fs.inotify.max_user_watches` — easy on a large tree — made
        // every watch call fail silently: the thread then polled forever,
        // received nothing, and auto-refresh simply never happened, with no log
        // line and nothing in the UI to explain it.
        let (registered, failed) = {
            let mut registered = 0usize;
            let mut failed = 0usize;
            let mut note = |result: notify::Result<()>, what: &str| match result {
                Ok(()) => registered += 1,
                Err(e) => {
                    failed += 1;
                    log::warn!("Failed to watch {}: {}", what, e);
                }
            };

            // 1. Watch root non-recursively to detect root file edits
            note(
                debouncer
                    .watcher()
                    .watch(watch_path, RecursiveMode::NonRecursive),
                &watch_path.display().to_string(),
            );

            // 2. Watch the git directory recursively to detect ref/branch/commit
            //    changes. In a linked worktree or a submodule, `.git` is a *file*
            //    pointing elsewhere, so watching it directly would silently observe
            //    nothing. Ask libgit2 where the real directory is.
            for git_dir in &git_dirs {
                note(
                    debouncer.watcher().watch(git_dir, RecursiveMode::Recursive),
                    &git_dir.display().to_string(),
                );
            }

            // 3. Watch non-ignored top-level directories recursively.
            //
            // The ignore decision comes from the repository's own rules rather than
            // a hardcoded name list. The old list covered the JS/Rust cases its
            // author happened to hit — a project with `.venv`, `Pods`, `bin`, `obj`
            // or any other large ignored directory got it watched recursively,
            // which is expensive everywhere and can exhaust inotify watches on
            // Linux. `is_path_ignored` answers for whatever the repo actually
            // gitignores, so it also stays correct as a project's layout changes.
            if let Ok(entries) = std::fs::read_dir(watch_path) {
                for entry in entries.flatten() {
                    if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        continue;
                    }
                    let path = entry.path();
                    if !should_watch_top_level_dir(&path, watch_path, ignore_repo.as_ref()) {
                        continue;
                    }
                    note(
                        debouncer.watcher().watch(&path, RecursiveMode::Recursive),
                        &path.display().to_string(),
                    );
                    watched_dirs.insert(path);
                }
            }

            (registered, failed)
        };

        if registered == 0 {
            log::error!(
                "Watching repository {} registered no paths ({} failures); \
                 auto-refresh will not work for this repository. On Linux this \
                 usually means fs.inotify.max_user_watches is exhausted.",
                repo_path,
                failed
            );
        } else {
            log::info!(
                "Watching repository: {} (session: {}, {} paths, {} failures)",
                repo_path,
                watcher_id,
                registered,
                failed
            );
        }

        loop {
            // Wakes up periodically (1s) to check if the repository is still open in AppState.
            // This prevents background thread leaks and race conditions when repos are switched/reopened.
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(Ok(events)) => {
                    let state = app.state::<AppState>();
                    if state.get_watcher_id(&repo_path).as_deref() != Some(&watcher_id) {
                        log::info!(
                            "Repository no longer active or watcher session expired. Stopping watcher for: {}",
                            repo_path
                        );
                        break;
                    }

                    // A top-level directory created after start-up was never
                    // registered, so nothing inside it would ever be reported.
                    // The root is watched non-recursively, so its creation does
                    // arrive here; register it now.
                    for event in &events {
                        let path = &event.path;
                        if path.parent() == Some(watch_path)
                            && path.is_dir()
                            && !watched_dirs.contains(path)
                            && should_watch_top_level_dir(path, watch_path, ignore_repo.as_ref())
                        {
                            match debouncer.watcher().watch(path, RecursiveMode::Recursive) {
                                Ok(()) => {
                                    watched_dirs.insert(path.clone());
                                }
                                Err(e) => log::warn!("Failed to watch {}: {}", path.display(), e),
                            }
                        }
                    }

                    let significant = events.iter().any(|e| {
                        is_significant_event(&e.path, watch_path, &git_dirs, ignore_repo.as_ref())
                    });

                    if significant {
                        let refs_changed = events.iter().any(|e| is_ref_change(&e.path, &git_dirs));
                        let _ = app.emit(
                            "repo:changed",
                            RepoChangedPayload {
                                repo_path: repo_path.clone(),
                                refs_changed,
                            },
                        );
                    }
                }
                Ok(Err(e)) => {
                    log::error!("Watcher error: {:?}", e);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let state = app.state::<AppState>();
                    if state.get_watcher_id(&repo_path).as_deref() != Some(&watcher_id) {
                        log::info!(
                            "Watcher timeout: repository no longer active or session expired. Stopping watcher for: {}",
                            repo_path
                        );
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    log::info!("Watcher channel closed for: {}", repo_path);
                    break;
                }
            }
        }
    });
}

/// Whether a top-level directory of the working tree should be watched
/// recursively: not `.git` (handled separately, with worktree/submodule
/// resolution) and not ignored by the repository.
fn should_watch_top_level_dir(
    path: &Path,
    repo_root: &Path,
    repo: Option<&git2::Repository>,
) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name == ".git" {
        return false;
    }
    !is_ignored(path, repo_root, repo)
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
