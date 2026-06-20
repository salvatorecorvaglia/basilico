use crate::error::AppError;
use git2::{build::CheckoutBuilder, FetchOptions, MergeOptions, PushOptions, Repository};

#[tauri::command]
pub async fn fetch(app: tauri::AppHandle, path: String, remote: String) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let mut remote_obj = repo.find_remote(&remote)?;

    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);

    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(crate::git::credentials::make_callbacks(ssh_key_path));

    remote_obj.fetch(&[] as &[&str], Some(&mut fetch_opts), None)?;

    Ok(())
}

#[tauri::command]
pub async fn push(
    app: tauri::AppHandle,
    path: String,
    remote: String,
    branch: String,
    force: bool,
) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let mut remote_obj = repo.find_remote(&remote)?;

    let refspec = if force {
        format!("+refs/heads/{}:refs/heads/{}", branch, branch)
    } else {
        format!("refs/heads/{}:refs/heads/{}", branch, branch)
    };

    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);

    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(crate::git::credentials::make_callbacks(ssh_key_path));

    remote_obj.push(&[refspec.as_str()], Some(&mut push_opts))?;

    Ok(())
}

#[tauri::command]
pub async fn pull(
    app: tauri::AppHandle,
    path: String,
    remote: String,
    branch: String,
) -> Result<String, AppError> {
    let repo = Repository::open(&path)?;

    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);

    // Step 1: Fetch
    let mut remote_obj = repo.find_remote(&remote)?;
    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(crate::git::credentials::make_callbacks(
        ssh_key_path.clone(),
    ));

    remote_obj.fetch(&[branch.as_str()], Some(&mut fetch_opts), None)?;

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

        let refname = format!("refs/heads/{}", branch);
        match repo.find_reference(&refname) {
            Ok(mut r) => {
                r.set_target(target_oid, &format!("pull: fast-forward to {}", target_oid))?;
            }
            Err(_) => {
                repo.reference(&refname, target_oid, true, "pull: fast-forward")?;
            }
        }
        repo.set_head(&refname)?;
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
        let sig = repo.signature().unwrap_or_else(|_| {
            git2::Signature::now("Basilico User", "user@basilico.app").unwrap()
        });
        let mut index = repo.index()?;
        let tree_oid = index.write_tree()?;
        let tree = repo.find_tree(tree_oid)?;
        let msg = format!("Merge branch '{}' of {}", branch, remote);
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &msg,
            &tree,
            &[&head, &remote_commit],
        )?;
        repo.cleanup_state()?;
        Ok("success".to_string())
    }
}
