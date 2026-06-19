use parking_lot::Mutex;
use std::collections::HashSet;

/// Holds open repository paths.
/// Wrapped in Mutex for thread-safe access from Tauri commands.
pub struct AppState {
    /// Set of active repository paths
    pub repos: Mutex<HashSet<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(HashSet::new()),
        }
    }

    pub fn add_repo(&self, path: String) {
        let mut repos = self.repos.lock();
        repos.insert(path);
    }

    pub fn remove_repo(&self, path: &str) {
        let mut repos = self.repos.lock();
        repos.remove(path);
    }

    pub fn has_repo(&self, path: &str) -> bool {
        let repos = self.repos.lock();
        repos.contains(path)
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
