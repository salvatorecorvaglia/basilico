use crate::error::AppError;
use crate::git::graph;

#[tauri::command]
pub async fn get_log(
    path: String,
    max_commits: Option<usize>,
    first_parent: Option<bool>,
    hide_remotes: Option<bool>,
    path_filter: Option<String>,
    skip: Option<usize>,
) -> Result<Vec<graph::GraphCommit>, AppError> {
    tokio::task::spawn_blocking(move || {
        let max = max_commits.unwrap_or(1000);
        let fp = first_parent.unwrap_or(false);
        let hr = hide_remotes.unwrap_or(false);
        graph::build_graph_page(
            &path,
            skip.unwrap_or(0),
            max,
            fp,
            hr,
            path_filter.as_deref(),
        )
    })
    .await?
}
