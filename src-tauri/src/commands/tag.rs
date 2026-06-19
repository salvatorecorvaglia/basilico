use crate::git::repository;

#[tauri::command]
pub async fn list_tags(path: String) -> Result<Vec<repository::TagInfo>, String> {
    repository::list_tags(&path).map_err(|e| e.message)
}

#[tauri::command]
pub async fn delete_tag(path: String, name: String) -> Result<(), String> {
    let repo = git2::Repository::open(&path).map_err(|e| e.to_string())?;
    repo.tag_delete(&name).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn create_tag(
    path: String,
    name: String,
    target_oid: String,
    message: Option<String>,
    force: bool,
) -> Result<(), String> {
    let repo = git2::Repository::open(&path).map_err(|e| e.to_string())?;
    let oid = git2::Oid::from_str(&target_oid).map_err(|e| e.to_string())?;
    let target = repo.find_object(oid, None).map_err(|e| e.to_string())?;

    if let Some(msg) = message {
        let sig = repo.signature().or_else(|_| {
            git2::Signature::now("Basilico", "basilico@example.com")
        }).map_err(|e| e.to_string())?;
        repo.tag(&name, &target, &sig, &msg, force)
            .map_err(|e| e.to_string())?;
    } else {
        repo.tag_lightweight(&name, &target, force)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn push_tag(
    path: String,
    remote: String,
    tag_name: String,
) -> Result<(), String> {
    let repo = git2::Repository::open(&path).map_err(|e| e.to_string())?;
    let mut remote_obj = repo.find_remote(&remote).map_err(|e| e.to_string())?;

    let refspec = format!("refs/tags/{}:refs/tags/{}", tag_name, tag_name);

    let mut push_opts = git2::PushOptions::new();
    push_opts.remote_callbacks(crate::git::credentials::make_callbacks());

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(|e| e.to_string())?;

    Ok(())
}


