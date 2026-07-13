use crate::error::AppError;
use crate::git::helpers;
use git2::{build::CheckoutBuilder, FetchOptions, MergeOptions, PushOptions, Repository};

#[tauri::command]
pub async fn fetch(app: tauri::AppHandle, path: String, remote: String) -> Result<(), AppError> {
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let mut remote_obj = repo.find_remote(&remote)?;

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(crate::git::credentials::make_callbacks(ssh_key_path));

        remote_obj.fetch(&[] as &[&str], Some(&mut fetch_opts), None)?;

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn push(
    app: tauri::AppHandle,
    path: String,
    remote: String,
    branch: String,
    force: bool,
) -> Result<(), AppError> {
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let mut remote_obj = repo.find_remote(&remote)?;

        let refspec = if force {
            format!("+refs/heads/{}:refs/heads/{}", branch, branch)
        } else {
            format!("refs/heads/{}:refs/heads/{}", branch, branch)
        };

        let mut push_opts = PushOptions::new();
        push_opts.remote_callbacks(crate::git::credentials::make_callbacks(ssh_key_path));

        remote_obj.push(&[refspec.as_str()], Some(&mut push_opts))?;

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn pull(
    app: tauri::AppHandle,
    path: String,
    remote: String,
    branch: String,
) -> Result<String, AppError> {
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;

        // Step 1: Fetch
        let mut remote_obj = repo.find_remote(&remote)?;
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(crate::git::credentials::make_callbacks(
            ssh_key_path.clone(),
        ));

        let refspec = format!("+refs/heads/{}:refs/remotes/{}/{}", branch, remote, branch);
        remote_obj.fetch(&[refspec.as_str()], Some(&mut fetch_opts), None)?;

        // Step 2: Merge the remote tracking branch into current HEAD
        let remote_ref = format!("refs/remotes/{}/{}", remote, branch);
        let reference = repo.find_reference(&remote_ref)?;
        let annotated = repo.reference_to_annotated_commit(&reference)?;

        let (merge_analysis, _) = repo.merge_analysis(&[&annotated])?;

        if merge_analysis.is_up_to_date() {
            return Ok("success".to_string());
        }

        if merge_analysis.is_fast_forward() {
            // Fast-forward: just move HEAD to the remote commit
            let target_oid = annotated.id();
            let target_object = repo.find_object(target_oid, None)?;
            repo.checkout_tree(&target_object, Some(CheckoutBuilder::new().safe()))?;

            let head_ref = repo.head()?;
            if head_ref.is_branch() {
                if let Some(refname) = head_ref.name() {
                    let mut r = repo.find_reference(refname)?;
                    r.set_target(target_oid, &format!("pull: fast-forward to {}", target_oid))?;
                    repo.set_head(refname)?;
                }
            } else {
                repo.set_head_detached(target_oid)?;
            }
            return Ok("success".to_string());
        }

        // Normal merge
        let mut merge_opts = MergeOptions::new();
        let mut checkout_opts = CheckoutBuilder::new();
        checkout_opts.safe();

        repo.merge(
            &[&annotated],
            Some(&mut merge_opts),
            Some(&mut checkout_opts),
        )?;

        if repo.index().map(|idx| idx.has_conflicts()).unwrap_or(false) {
            Ok("conflicts".to_string())
        } else {
            // Create merge commit to finalize the merge
            let head = repo.head()?.peel_to_commit()?;
            let remote_commit = repo.find_commit(annotated.id())?;
            let msg = format!("Merge branch '{}' of {}", branch, remote);
            helpers::create_merge_commit(&repo, &head, &remote_commit, &msg)?;
            Ok("success".to_string())
        }
    })
    .await?
}
