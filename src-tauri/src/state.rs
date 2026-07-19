use parking_lot::Mutex;
use std::collections::HashMap;

/// Holds open repository paths and their active watcher session IDs, plus cached settings.
/// Wrapped in Mutex for thread-safe access from Tauri commands.
pub struct AppState {
    /// Map of active repository paths to their unique watcher session ID
    pub repos: Mutex<HashMap<String, String>>,
    /// Cached user settings to avoid disk reads on every git command
    pub settings: Mutex<Option<crate::commands::settings::UserSettings>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(HashMap::new()),
            settings: Mutex::new(None),
        }
    }

    pub fn try_add_repo(&self, path: String, watcher_id: String) -> bool {
        let mut repos = self.repos.lock();
        if let std::collections::hash_map::Entry::Vacant(e) = repos.entry(path) {
            e.insert(watcher_id);
            true
        } else {
            false
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

