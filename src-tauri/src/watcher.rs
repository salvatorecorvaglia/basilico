use crate::state::AppState;
use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use serde::Serialize;
use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoChangedPayload {
    pub repo_path: String,
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

        // 1. Watch root non-recursively to detect root file edits
        let _ = debouncer
            .watcher()
            .watch(watch_path, RecursiveMode::NonRecursive);

        // 2. Watch the git directory recursively to detect ref/branch/commit
        //    changes. In a linked worktree or a submodule, `.git` is a *file*
        //    pointing elsewhere, so watching it directly would silently observe
        //    nothing. Ask libgit2 where the real directory is.
        for git_dir in resolve_git_dirs(watch_path) {
            let _ = debouncer
                .watcher()
                .watch(&git_dir, RecursiveMode::Recursive);
        }

        // 3. Watch non-ignored top-level directories recursively
        if let Ok(entries) = std::fs::read_dir(watch_path) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let path = entry.path();
                        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if name != ".git"
                            && name != "node_modules"
                            && name != "target"
                            && name != "dist"
                            && name != "build"
                            && name != ".next"
                            && name != ".turbo"
                            && name != "out"
                            && name != "vendor"
                            && name != "coverage"
                            && name != ".cache"
                            && name != "tmp"
                            && name != "storage"
                            && name != ".idea"
                            && name != ".vscode"
                        {
                            let _ = debouncer.watcher().watch(&path, RecursiveMode::Recursive);
                        }
                    }
                }
            }
        }

        log::info!(
            "Watching repository: {} (session: {})",
            repo_path,
            watcher_id
        );

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

                    // Filter out .git/index.lock, transient files, and massive ignored directories
                    let significant = events
                        .iter()
                        .any(|e| is_significant_path(&e.path.to_string_lossy()));

                    if significant {
                        let _ = app.emit(
                            "repo:changed",
                            RepoChangedPayload {
                                repo_path: repo_path.clone(),
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

/// The git directories worth watching for a repository at `repo_path`.
///
/// For a normal repository this is just `.git`. For a linked worktree it is the
/// worktree's own git directory *and* the shared common directory, since refs
/// live in the latter while `HEAD` lives in the former.
fn resolve_git_dirs(repo_path: &Path) -> Vec<std::path::PathBuf> {
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

/// Returns true if the changed file path is significant (not ignored or transient).
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

    for comp in path.components() {
        let name = comp.as_os_str().to_string_lossy();
        if name == "node_modules"
            || name == "target"
            || name == ".next"
            || name == ".turbo"
            || name == "dist"
            || name == "build"
            || name == "out"
            || name == "vendor"
            || name == "coverage"
            || name == ".cache"
            || name == "tmp"
            || name == "storage"
            || name == ".idea"
            || name == ".vscode"
        {
            return false;
        }
    }

    let normalized = path_str.replace('\\', "/");
    !normalized.contains(".git/objects/")
}
