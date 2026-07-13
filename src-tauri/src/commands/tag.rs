use crate::error::AppError;
use crate::git::repository;

#[tauri::command]
pub async fn list_tags(path: String) -> Result<Vec<repository::TagInfo>, AppError> {
    tokio::task::spawn_blocking(move || repository::list_tags(&path))
        .await?
}

#[tauri::command]
pub async fn delete_tag(path: String, name: String) -> Result<(), AppError> {
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
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;
        let oid = git2::Oid::from_str(&target_oid)?;
        let target = repo.find_object(oid, None)?;

        if let Some(msg) = message {
            let sig = repo
                .signature()
                .or_else(|_| git2::Signature::now("Basilico", "basilico@example.com"))?;
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
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;
        let mut remote_obj = repo.find_remote(&remote)?;

        let refspec = format!("refs/tags/{}:refs/tags/{}", tag_name, tag_name);

        let mut push_opts = git2::PushOptions::new();
        push_opts.remote_callbacks(crate::git::credentials::make_callbacks(ssh_key_path));

        remote_obj.push(&[refspec.as_str()], Some(&mut push_opts))?;

        Ok(())
    })
    .await?
}
