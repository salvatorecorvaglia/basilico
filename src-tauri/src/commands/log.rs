use crate::git::graph;
use crate::error::AppError;

#[tauri::command]
pub async fn get_log(
    path: String,
    max_commits: Option<usize>,
) -> Result<Vec<graph::GraphCommit>, AppError> {
    let max = max_commits.unwrap_or(1000);
    graph::build_graph(&path, max)
}

