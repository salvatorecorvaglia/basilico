use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};

/// Holds open repository paths and their active watcher session IDs, plus cached settings.
/// Wrapped in Mutex for thread-safe access from Tauri commands.
pub struct AppState {
    /// Map of active repository paths to their unique watcher session ID
    pub repos: Mutex<HashMap<String, String>>,
    /// Cached user settings to avoid disk reads on every git command
    pub settings: Mutex<Option<crate::commands::settings::UserSettings>>,
    /// Commit-graph lane assignments carried across "load more" pages, so
    /// paging through history doesn't repeat lane computation from scratch.
    pub graph_lane_cache:
        Mutex<HashMap<crate::git::graph::LaneCacheKey, crate::git::graph::LaneCacheEntry>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(HashMap::new()),
            settings: Mutex::new(None),
            graph_lane_cache: Mutex::new(HashMap::new()),
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
        let mut cache = self.graph_lane_cache.lock();
        cache.retain(|key, _| key.path() != path);
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

/// Canonical paths of the repositories open in a tab.
///
/// Every repository command used to accept any `path` the renderer sent, so
/// a compromised or buggy renderer could point `create_commit` (which runs
/// hooks), `rebase_start` or a merge tool at any directory on disk. Commands
/// now refuse a path that was not opened through `open_repo`.
///
/// A process-wide set rather than a field of [`AppState`], so the check needs
/// no extra parameter on the ~80 commands that perform it.
static OPEN_REPOS: std::sync::LazyLock<parking_lot::RwLock<HashSet<String>>> =
    std::sync::LazyLock::new(|| parking_lot::RwLock::new(HashSet::new()));

/// Record `path` as open. Called by `open_repo`.
pub fn register_open_repo(path: &str) {
    OPEN_REPOS
        .write()
        .insert(crate::git::utils::canonicalize_path(path));
}

/// Forget `path`. Called by `close_repo`.
pub fn unregister_open_repo(path: &str) {
    OPEN_REPOS
        .write()
        .remove(&crate::git::utils::canonicalize_path(path));
}

/// Refuse a repository command for a path that is not open in a tab.
pub fn ensure_open_repo(path: &str) -> Result<(), crate::error::AppError> {
    if OPEN_REPOS
        .read()
        .contains(&crate::git::utils::canonicalize_path(path))
    {
        Ok(())
    } else {
        Err(crate::error::AppError::invalid_state(format!(
            "'{}' is not a repository open in Basilico. Open it first.",
            path
        )))
    }
}
