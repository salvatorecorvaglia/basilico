use git2::{FetchOptions, PushOptions, MergeOptions, Repository, build::CheckoutBuilder};

#[tauri::command]
pub async fn fetch(path: String, remote: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut remote_obj = repo.find_remote(&remote).map_err(|e| e.to_string())?;

    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(crate::git::credentials::make_callbacks());

    remote_obj
        .fetch(&[] as &[&str], Some(&mut fetch_opts), None)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn push(
    path: String,
    remote: String,
    branch: String,
    force: bool,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut remote_obj = repo.find_remote(&remote).map_err(|e| e.to_string())?;

    let refspec = if force {
        format!("+refs/heads/{}:refs/heads/{}", branch, branch)
    } else {
        format!("refs/heads/{}:refs/heads/{}", branch, branch)
    };

    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(crate::git::credentials::make_callbacks());

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn pull(path: String, remote: String, branch: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

    // Step 1: Fetch
    let mut remote_obj = repo.find_remote(&remote).map_err(|e| e.to_string())?;
    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(crate::git::credentials::make_callbacks());

    remote_obj
        .fetch(&[branch.as_str()], Some(&mut fetch_opts), None)
        .map_err(|e| e.to_string())?;

    // Step 2: Merge the remote tracking branch into current HEAD
    let remote_ref = format!("refs/remotes/{}/{}", remote, branch);
    let reference = repo.find_reference(&remote_ref).map_err(|e| e.to_string())?;
    let annotated = repo
        .reference_to_annotated_commit(&reference)
        .map_err(|e| e.to_string())?;

    let mut merge_opts = MergeOptions::new();
    let mut checkout_opts = CheckoutBuilder::new();
    checkout_opts.safe();

    repo.merge(&[&annotated], Some(&mut merge_opts), Some(&mut checkout_opts))
        .map_err(|e| e.to_string())?;

    if repo.index().map(|idx| idx.has_conflicts()).unwrap_or(false) {
        Ok("conflicts".to_string())
    } else {
        Ok("success".to_string())
    }
}
