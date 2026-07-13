use crate::error::AppError;
use crate::git::graph;

#[tauri::command]
pub async fn get_log(
    path: String,
    max_commits: Option<usize>,
) -> Result<Vec<graph::GraphCommit>, AppError> {
    tokio::task::spawn_blocking(move || {
        let max = max_commits.unwrap_or(1000);
        graph::build_graph(&path, max)
    })
    .await?
}
