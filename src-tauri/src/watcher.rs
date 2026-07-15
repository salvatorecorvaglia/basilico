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

        // Watch root recursively so new top-level directories are automatically covered.
        // NOTE: On Linux systems, massive repositories with huge unignored folders (like target/ or node_modules/)
        // may exceed fs.inotify.max_user_watches limits. Users should configure their system limits accordingly.
        // The event filter below handles ignoring node_modules/target/etc.
        if let Err(e) = debouncer
            .watcher()
            .watch(watch_path, RecursiveMode::Recursive)
        {
            log::warn!(
                "Failed to watch root path {} recursively: {}. Falling back to watching .git folder...",
                repo_path,
                e
            );
            let git_path = watch_path.join(".git");
            if let Err(err) = debouncer
                .watcher()
                .watch(&git_path, RecursiveMode::Recursive)
            {
                log::error!(
                    "Failed to watch fallback .git path {}: {}",
                    git_path.display(),
                    err
                );
                return;
            }
        }

        log::info!(
            "Watching repository: {} (session: {})",
            repo_path,
            watcher_id
        );

        loop {
            // Wakes up periodically to check if the repository is still open in AppState.
            // This prevents background thread leaks when repositories are closed.
            match rx.recv_timeout(Duration::from_secs(5)) {
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

/// Returns true if the changed file path is significant (not ignored or transient).
pub fn is_significant_path(path_str: &str) -> bool {
    !path_str.contains(".git/index.lock")
        && !path_str.contains(".git/FETCH_HEAD")
        && !path_str.contains(".git/objects/")
        && !path_str.contains("node_modules/")
        && !path_str.contains("target/")
        && !path_str.ends_with(".swp")
        && !path_str.ends_with("~")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_significant_path() {
        assert!(is_significant_path("src/main.rs"));
        assert!(is_significant_path("Cargo.toml"));
        assert!(!is_significant_path(".git/index.lock"));
        assert!(!is_significant_path("node_modules/lodash/index.js"));
        assert!(!is_significant_path("target/debug/basilico"));
        assert!(!is_significant_path("src/main.rs.swp"));
        assert!(!is_significant_path("src/main.rs~"));
    }
}
