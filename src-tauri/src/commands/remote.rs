use crate::error::AppError;
use crate::git::helpers;
use crate::git::progress::NetworkOperation;
use git2::{FetchOptions, Repository};

#[tauri::command]
pub async fn fetch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    remote: String,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let op = NetworkOperation::begin(&path, "fetch", app);
        let repo = Repository::open(&path)?;
        let mut remote_obj = repo.find_remote(&remote)?;

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(crate::git::credentials::make_callbacks_with_progress(
            ssh_key_path,
            Some(reporter_for(&op)),
            remote_obj.url().ok(),
        ));

        op.finish(remote_obj.fetch(&[] as &[&str], Some(&mut fetch_opts), None))?;

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
    crate::state::ensure_open_repo(&path)?;
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        refuse_detached_head(&branch)?;
        // Started before the lease check, whose connection to the remote may
        // need credentials or host-key trust from the user too.
        let op = NetworkOperation::begin(&path, "push", app);
        let repo = Repository::open(&path)?;
        let mut remote_obj = repo.find_remote(&remote)?;

        // `branch` is the local branch. It goes to its upstream when that
        // upstream lives on this remote — which may have a different name —
        // and otherwise to the same name, publishing it. It used to always be
        // the same name, so a branch tracking `origin/main` from a local
        // `feature` pushed a new `origin/feature` instead.
        let upstream_here = upstream_branch_on(&repo, &branch, &remote);
        let remote_branch = upstream_here.clone().unwrap_or_else(|| branch.clone());

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

            // The lease is only meaningful if the value really is an object id.
            // It also has to be ASCII before the truncation below can slice it:
            // a multi-byte value made `&expected[..7]` land mid-character and
            // panic, so the one guard standing between the user and an
            // irreversible overwrite reported an opaque "Task join error".
            if expected.len() != 40 || !expected.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(AppError::invalid_state(format!(
                    "Refusing to force push: '{}' is not a valid commit id for {}/{}, \
                     so the remote tip cannot be verified. Fetch first.",
                    expected, remote, branch
                )));
            }

            let remote_ref = format!("refs/remotes/{}/{}", remote, remote_branch);
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
                    short(expected),
                    short(&actual)
                )));
            }

            // The checks above only prove the UI and the local remote-tracking
            // ref agree — both come from the last fetch. The lease is about the
            // *remote*: if someone pushed since that fetch, the server's tip
            // differs from `expected`, and forcing would discard their commits.
            // libgit2 cannot send an expected old value with the push itself,
            // so ask the server first; the window between this check and the
            // push is the only one left open.
            let remote_refname = format!("refs/heads/{}", remote_branch);
            let remote_tip = crate::git::push::remote_ref_tip(
                &mut remote_obj,
                &remote_refname,
                ssh_key_path.clone(),
                Some(&op),
            )?;
            match remote_tip {
                Some(tip) if tip.to_string() == expected => {}
                Some(tip) => {
                    return Err(AppError::invalid_state(format!(
                        "Refusing to force push: {}/{} on the remote is at {}, but you last \
                         fetched {}. Someone else has pushed since — fetch and review their \
                         commits first.",
                        remote,
                        branch,
                        short(&tip.to_string()),
                        short(expected)
                    )));
                }
                None => {
                    return Err(AppError::invalid_state(format!(
                        "Refusing to force push: {}/{} no longer exists on the remote. \
                         Fetch first to see what changed.",
                        remote, branch
                    )));
                }
            }
        }

        let refspec = format!(
            "{}refs/heads/{}:refs/heads/{}",
            if force { "+" } else { "" },
            branch,
            remote_branch
        );

        crate::git::push::push_refspecs_reporting(
            &mut remote_obj,
            &[refspec.as_str()],
            ssh_key_path,
            Some(&op),
        )?;
        drop(op);

        // First push of a branch with no upstream at all: track what was just
        // published, as `git push -u` would. Without it ahead/behind stayed at
        // 0/0 forever, which reads as "in sync" rather than "not tracked". A
        // branch already tracking some *other* remote is left alone.
        if upstream_here.is_none() {
            if let Ok(mut local) = repo.find_branch(&branch, git2::BranchType::Local) {
                if local.upstream().is_err() {
                    let upstream = format!("{}/{}", remote, remote_branch);
                    if let Err(e) = local.set_upstream(Some(&upstream)) {
                        log::warn!("Pushed, but could not set upstream {}: {}", upstream, e);
                    }
                }
            }
        }

        Ok(())
    })
    .await?
}

/// Refuse to sync a detached HEAD. The frontend passes the current branch
/// name, which on a detached HEAD is the literal "HEAD" — pushing that created
/// a branch called `HEAD` on the remote.
fn refuse_detached_head(branch: &str) -> Result<(), AppError> {
    if branch == "HEAD" {
        return Err(AppError::invalid_state(
            "You are not on a branch (detached HEAD). Create or check out a branch \
             to push or pull these commits.",
        ));
    }
    Ok(())
}

/// The name of `branch`'s upstream on `remote` (from `branch.<name>.remote`
/// and `branch.<name>.merge`), or `None` if it tracks nothing there.
fn upstream_branch_on(repo: &Repository, branch: &str, remote: &str) -> Option<String> {
    let config = repo.config().ok()?;
    let tracked_remote = config
        .get_string(&format!("branch.{}.remote", branch))
        .ok()?;
    if tracked_remote != remote {
        return None;
    }
    let merge = config
        .get_string(&format!("branch.{}.merge", branch))
        .ok()?;
    merge.strip_prefix("refs/heads/").map(str::to_string)
}

#[tauri::command]
pub async fn pull<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    remote: String,
    branch: String,
    mode: Option<String>,
) -> Result<helpers::MergeOutcome, AppError> {
    crate::state::ensure_open_repo(&path)?;
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        refuse_detached_head(&branch)?;
        let repo = Repository::open(&path)?;

        // Step 1: Fetch
        let op = NetworkOperation::begin(&path, "pull", app);
        let mut remote_obj = repo.find_remote(&remote)?;
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(crate::git::credentials::make_callbacks_with_progress(
            ssh_key_path.clone(),
            Some(reporter_for(&op)),
            remote_obj.url().ok(),
        ));

        let refspec = format!("+refs/heads/{}:refs/remotes/{}/{}", branch, remote, branch);
        op.finish(remote_obj.fetch(&[refspec.as_str()], Some(&mut fetch_opts), None))?;
        // The network part is over: report it done before the merge or rebase.
        drop(op);

        // Step 2: Integrate the remote tracking branch into the current branch
        let remote_ref = format!("refs/remotes/{}/{}", remote, branch);
        let reference = repo.find_reference(&remote_ref)?;
        let annotated = repo.reference_to_annotated_commit(&reference)?;

        match PullMode::resolve(&repo, mode.as_deref())? {
            PullMode::Merge => {
                let msg = format!("Merge branch '{}' of {}", branch, remote);
                helpers::perform_merge(&repo, &annotated, "pull", &msg)
            }
            PullMode::FastForwardOnly => {
                let (analysis, _) = repo.merge_analysis(&[&annotated])?;
                if analysis.is_up_to_date() || analysis.is_fast_forward() {
                    let msg = format!("Merge branch '{}' of {}", branch, remote);
                    helpers::perform_merge(&repo, &annotated, "pull", &msg)
                } else {
                    Err(AppError::git(format!(
                        "Cannot fast-forward: your branch and {} have diverged. Pull with \
                         merge or rebase instead.",
                        remote_ref.trim_start_matches("refs/remotes/")
                    )))
                }
            }
            PullMode::Rebase => {
                let (analysis, _) = repo.merge_analysis(&[&annotated])?;
                if analysis.is_up_to_date() {
                    return Ok(helpers::MergeOutcome::Success);
                }
                // The git CLI rather than libgit2, so `rebase.autoStash`, hooks
                // and signing all apply exactly as they would for `git pull
                // --rebase`. Nothing here may wait for an editor.
                let output = crate::commands::new_command("git")
                    .current_dir(&path)
                    .env("GIT_EDITOR", "true")
                    .args(["rebase", &remote_ref])
                    .output()
                    .map_err(|e| AppError::command(format!("Failed to run git rebase: {}", e)))?;

                let repo = Repository::open(&path)?;
                if matches!(
                    repo.state(),
                    git2::RepositoryState::Rebase
                        | git2::RepositoryState::RebaseInteractive
                        | git2::RepositoryState::RebaseMerge
                ) {
                    // Stopped on conflicts; the conflict banner offers
                    // continue/abort for the rebase.
                    Ok(helpers::MergeOutcome::Conflicts)
                } else if output.status.success() {
                    Ok(helpers::MergeOutcome::Success)
                } else {
                    Err(AppError::git(crate::commands::git_failure_message(
                        &["rebase", &remote_ref],
                        &output,
                    )))
                }
            }
        }
    })
    .await?
}

/// How `pull` integrates the fetched branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PullMode {
    Merge,
    Rebase,
    FastForwardOnly,
}

impl PullMode {
    /// An explicit choice from the UI wins; otherwise the repository's own
    /// `pull.rebase` / `pull.ff` settings decide, as they do for `git pull`.
    /// Pull used to always merge, whatever those settings said.
    fn resolve(repo: &Repository, requested: Option<&str>) -> Result<PullMode, AppError> {
        match requested {
            Some("merge") => return Ok(PullMode::Merge),
            Some("rebase") => return Ok(PullMode::Rebase),
            Some("ff-only") => return Ok(PullMode::FastForwardOnly),
            Some(other) => {
                return Err(AppError::invalid_state(format!(
                    "Unknown pull mode '{}': expected merge, rebase or ff-only",
                    other
                )))
            }
            None => {}
        }

        let config = repo.config()?;
        let rebase = config
            .get_string("pull.rebase")
            .map(|v| v.to_lowercase())
            .unwrap_or_default();
        // `true`, `merges` and `interactive` all mean rebase; `false` merges.
        if matches!(
            rebase.as_str(),
            "true" | "merges" | "interactive" | "i" | "m"
        ) {
            return Ok(PullMode::Rebase);
        }
        let ff = config
            .get_string("pull.ff")
            .map(|v| v.to_lowercase())
            .unwrap_or_default();
        if ff == "only" {
            return Ok(PullMode::FastForwardOnly);
        }
        Ok(PullMode::Merge)
    }
}

/// The first seven characters of an object id, for messages.
fn short(oid: &str) -> String {
    oid.chars().take(7).collect()
}

/// The shared reporter remote callbacks use for `op`.
fn reporter_for(op: &NetworkOperation) -> crate::git::credentials::SharedProgress {
    std::rc::Rc::new(std::cell::RefCell::new(op.reporter()))
}

/// Stop the clone, fetch, pull or push running for `key` (a repository path,
/// or a clone's destination). Returns whether one was running.
#[tauri::command]
pub async fn cancel_network_operation(key: String) -> Result<bool, AppError> {
    Ok(crate::git::progress::cancel(&key))
}

/// The user's answer to a `git:prompt` question (credentials, or trusting an
/// SSH host key). `None` declines. Returns whether the question was still
/// waiting for an answer.
#[tauri::command]
pub async fn answer_git_prompt(
    id: String,
    answer: Option<crate::git::prompts::PromptAnswer>,
) -> Result<bool, AppError> {
    Ok(crate::git::prompts::answer(&id, answer))
}
