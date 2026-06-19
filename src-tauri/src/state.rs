use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::PathBuf;

/// Holds open repository handles and associated watchers.
/// Wrapped in Mutex for thread-safe access from Tauri commands.
pub struct AppState {
    /// Map of repo path -> cached repo info
    pub repos: Mutex<HashMap<String, OpenRepo>>,
}

pub struct OpenRepo {
    pub path: PathBuf,
    pub watcher_active: bool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(HashMap::new()),
        }
    }

    pub fn add_repo(&self, path: String, repo_path: PathBuf) {
        let mut repos = self.repos.lock();
        repos.insert(
            path,
            OpenRepo {
                path: repo_path,
                watcher_active: false,
            },
        );
    }

    pub fn remove_repo(&self, path: &str) {
        let mut repos = self.repos.lock();
        repos.remove(path);
    }

    pub fn has_repo(&self, path: &str) -> bool {
        let repos = self.repos.lock();
        repos.contains_key(path)
    }

    pub fn set_watcher_active(&self, path: &str, active: bool) {
        let mut repos = self.repos.lock();
        if let Some(repo) = repos.get_mut(path) {
            repo.watcher_active = active;
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
