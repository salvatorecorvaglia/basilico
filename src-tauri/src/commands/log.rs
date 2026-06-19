use crate::git::graph;

#[tauri::command]
pub async fn get_log(
    path: String,
    max_commits: Option<usize>,
) -> Result<Vec<graph::GraphCommit>, String> {
    let max = max_commits.unwrap_or(1000);
    graph::build_graph(&path, max).map_err(|e| e.message)
}
