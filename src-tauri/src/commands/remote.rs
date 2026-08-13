use crate::error::AppError;
use crate::git::helpers;
use git2::{build::CheckoutBuilder, FetchOptions, MergeOptions, PushOptions, Repository};

#[tauri::command]
pub async fn fetch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    remote: String,
) -> Result<(), AppError> {
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
pub async fn push<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    remote: String,
    branch: String,
    force: bool,
    expected_remote_oid: Option<String>,
) -> Result<(), AppError> {
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let mut remote_obj = repo.find_remote(&remote)?;

        // A force push overwrites whatever is on the remote. `expected_remote_oid`
        // carries the remote-tracking tip the UI last showed the user; if the
        // real remote has moved past it, someone else has pushed in the
        // meantime and the force would destroy their work. This is the
        // equivalent of git's --force-with-lease, which libgit2 does not
        // implement natively.
        // The lease must fail *closed*: every path that cannot establish what
        // the remote tip was has to refuse, otherwise the one guard protecting
        // an irreversible overwrite silently disappears exactly when the local
        // view of the remote is missing or stale.
        if force {
            let expected = expected_remote_oid
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    AppError::invalid_state(format!(
                        "Refusing to force push: Basilico has no record of what {}/{} pointed at, \
                         so it cannot tell whether someone else has pushed. Fetch first.",
                        remote, branch
                    ))
                })?;

            let remote_ref = format!("refs/remotes/{}/{}", remote, branch);
            let actual = repo
                .find_reference(&remote_ref)
                .ok()
                .and_then(|r| r.target())
                .ok_or_else(|| {
                    AppError::invalid_state(format!(
                        "Refusing to force push: no local tracking ref for {}/{}, so the remote \
                         tip cannot be verified. Fetch first.",
                        remote, branch
                    ))
                })?;

            let actual = actual.to_string();
            if actual != expected {
                return Err(AppError::invalid_state(format!(
                    "Refusing to force push: {}/{} has moved since you last fetched \
                     (expected {}, found {}). Fetch and review the new commits first.",
                    remote,
                    branch,
                    &expected[..7.min(expected.len())],
                    &actual[..7.min(actual.len())]
                )));
            }
        }

        let refspec = if force {
            format!("+refs/heads/{}:refs/heads/{}", branch, branch)
        } else {
            format!("refs/heads/{}:refs/heads/{}", branch, branch)
        };

        let rejections = crate::git::credentials::new_push_rejections();
        let mut push_opts = PushOptions::new();
        push_opts.remote_callbacks(crate::git::credentials::make_push_callbacks(
            ssh_key_path,
            rejections.clone(),
        ));

        remote_obj.push(&[refspec.as_str()], Some(&mut push_opts))?;
        crate::git::credentials::check_push_rejections(&rejections)?;

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn pull<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
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
                if let Ok(refname) = head_ref.name() {
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
