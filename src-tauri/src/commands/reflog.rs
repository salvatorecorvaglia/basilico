use git2::Repository;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub index: usize,
    pub new_oid: String,
    pub old_oid: String,
    pub selector: String,
    pub committer_name: String,
    pub committer_date: i64,
    pub message: String,
}

#[tauri::command]
pub async fn get_reflog(
    path: String,
    max_entries: Option<usize>,
) -> Result<Vec<ReflogEntry>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

    // Check if reflog exists. If not, return empty list.
    let reflog = match repo.reflog("HEAD") {
        Ok(rl) => rl,
        Err(_) => return Ok(Vec::new()),
    };

    let limit = max_entries.unwrap_or(200);
    let mut entries = Vec::new();

    for (idx, entry) in reflog.iter().enumerate() {
        let committer = entry.committer();
        entries.push(ReflogEntry {
            index: idx,
            new_oid: entry.id_new().to_string(),
            old_oid: entry.id_old().to_string(),
            selector: format!("HEAD@{{{}}}", idx),
            committer_name: committer.name().unwrap_or("Unknown").to_string(),
            committer_date: committer.when().seconds(),
            message: entry.message().unwrap_or("").to_string(),
        });

        if entries.len() >= limit {
            break;
        }
    }

    Ok(entries)
}
