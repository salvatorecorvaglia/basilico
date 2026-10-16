use crate::error::AppError;
use crate::git::graph;
use crate::state::AppState;
use tauri::Manager;

/// A digest of the refs the commit log is built from; unchanged means the log
/// the frontend already holds is still current. See [`graph::graph_fingerprint`].
#[tauri::command]
pub async fn get_log_fingerprint(
    path: String,
    hide_remotes: Option<bool>,
) -> Result<String, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        graph::graph_fingerprint(&path, hide_remotes.unwrap_or(false))
    })
    .await?
}

#[tauri::command]
pub async fn get_log<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    max_commits: Option<usize>,
    first_parent: Option<bool>,
    hide_remotes: Option<bool>,
    path_filter: Option<String>,
    skip: Option<usize>,
) -> Result<Vec<graph::GraphCommit>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let max = max_commits.unwrap_or(1000);
        let fp = first_parent.unwrap_or(false);
        let hr = hide_remotes.unwrap_or(false);
        let state = app.state::<AppState>();
        graph::build_graph_page_cached(
            &path,
            skip.unwrap_or(0),
            max,
            fp,
            hr,
            path_filter.as_deref(),
            &state.graph_lane_cache,
        )
    })
    .await?
}
