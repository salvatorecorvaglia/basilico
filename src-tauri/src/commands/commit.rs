use git2::{Repository, Signature};

#[tauri::command]
pub async fn create_commit(
    path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
    amend: bool,
) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;

    // Create signature
    let sig = if let (Some(name), Some(email)) = (author_name, author_email) {
        Signature::now(&name, &email).map_err(|e| e.to_string())?
    } else {
        repo.signature().unwrap_or_else(|_| {
            Signature::now("Basilico User", "user@basilico.app").unwrap()
        })
    };

    // Calculate parents
    let mut parents = Vec::new();
    let head = repo.head();

    if amend {
        if let Ok(head_ref) = head {
            let parent_commit = head_ref.peel_to_commit().map_err(|e| e.to_string())?;
            for i in 0..parent_commit.parent_count() {
                parents.push(parent_commit.parent(i).map_err(|e| e.to_string())?);
            }
        }
    } else {
        if let Ok(head_ref) = head {
            if let Ok(parent_commit) = head_ref.peel_to_commit() {
                parents.push(parent_commit);
            }
        }
    }

    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

    // Create commit and point HEAD to it
    let commit_id = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parent_refs)
        .map_err(|e| e.to_string())?;

    Ok(commit_id.to_string())
}
