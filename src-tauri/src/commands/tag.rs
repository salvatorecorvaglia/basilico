use crate::error::AppError;
use crate::git::helpers::require_signature;
use crate::git::repository;

#[tauri::command]
pub async fn list_tags(path: String) -> Result<Vec<repository::TagInfo>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || repository::list_tags(&path)).await?
}

#[tauri::command]
pub async fn delete_tag(path: String, name: String) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;
        repo.tag_delete(&name)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn create_tag(
    path: String,
    name: String,
    target_oid: String,
    message: Option<String>,
    force: bool,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;
        let oid = git2::Oid::from_str(&target_oid)?;
        let target = repo.find_object(oid, None)?;

        if let Some(msg) = message {
            let sig = require_signature(&repo)?;
            repo.tag(&name, &target, &sig, &msg, force)?;
        } else {
            repo.tag_lightweight(&name, &target, force)?;
        }
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn push_tag(
    app: tauri::AppHandle,
    path: String,
    remote: String,
    tag_name: String,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;
        let mut remote_obj = repo.find_remote(&remote)?;

        let refspec = format!("refs/tags/{}:refs/tags/{}", tag_name, tag_name);
        crate::git::push::push_refspecs(&mut remote_obj, &[refspec.as_str()], ssh_key_path)
    })
    .await?
}
