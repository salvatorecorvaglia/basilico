use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use serde::Serialize;
use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoChangedPayload {
    pub repo_path: String,
}

/// Start watching a repository for file changes.
/// Emits "repo:changed" events to the frontend with debouncing.
pub fn start_watching(app: AppHandle, repo_path: String) {
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
        if let Err(e) = debouncer
            .watcher()
            .watch(watch_path, RecursiveMode::Recursive)
        {
            log::error!("Failed to watch path {}: {}", repo_path, e);
            return;
        }

        log::info!("Watching repository: {}", repo_path);

        loop {
            match rx.recv() {
                Ok(Ok(events)) => {
                    // Filter out .git/index.lock and other transient files
                    let significant = events.iter().any(|e| {
                        let path_str = e.path.to_string_lossy();
                        !path_str.contains(".git/index.lock")
                            && !path_str.contains(".git/FETCH_HEAD")
                            && !path_str.ends_with(".swp")
                            && !path_str.ends_with("~")
                    });

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
                Err(_) => {
                    log::info!("Watcher channel closed for: {}", repo_path);
                    break;
                }
            }
        }
    });
}
