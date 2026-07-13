use parking_lot::Mutex;
use std::collections::HashMap;

/// Holds open repository paths and their active watcher session IDs.
/// Wrapped in Mutex for thread-safe access from Tauri commands.
pub struct AppState {
    /// Map of active repository paths to their unique watcher session ID
    pub repos: Mutex<HashMap<String, String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(HashMap::new()),
        }
    }

    pub fn try_add_repo(&self, path: String, watcher_id: String) -> bool {
        let mut repos = self.repos.lock();
        if repos.contains_key(&path) {
            false
        } else {
            repos.insert(path, watcher_id);
            true
        }
    }

    pub fn remove_repo(&self, path: &str) {
        let mut repos = self.repos.lock();
        repos.remove(path);
    }

    pub fn get_watcher_id(&self, path: &str) -> Option<String> {
        let repos = self.repos.lock();
        repos.get(path).cloned()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
