use crate::error::AppError;
use crate::git::repository;
use git2::Repository;

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Vec<repository::BranchInfo>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || repository::list_branches(&path)).await?
}

#[tauri::command]
pub async fn create_branch(
    path: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

        let repo = Repository::open(&path)?;
        let target = match start_point {
            // Peel rather than downcast: an annotated tag resolves to a tag
            // object, which `as_commit` rejected as "not a commit".
            Some(ref s) => repo
                .revparse_single(s)?
                .peel_to_commit()
                .map_err(|_| AppError::invalid_state("Start point is not a commit"))?,
            None => {
                let head = repo.head()?;
                head.peel_to_commit()?
            }
        };

        repo.branch(&name, &target, false)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn delete_branch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    name: String,
    is_remote: bool,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

        let repo = Repository::open(&path)?;
        delete_branch_at_tip(&repo, &name, is_remote, None, ssh_key_path)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn checkout_branch(path: String, name: String) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

        let repo = Repository::open(&path)?;

        // A full 40-character hex string is treated as a commit OID. The length
        // check matters: `Oid::from_str` also accepts shorter hex strings and
        // zero-pads them, so branches with all-hex names ("add", "beef") would
        // otherwise be checked out as a detached HEAD at a bogus OID.
        let looks_like_full_oid = name.len() == 40 && name.chars().all(|c| c.is_ascii_hexdigit());

        if looks_like_full_oid && repo.find_branch(&name, git2::BranchType::Local).is_err() {
            let oid = git2::Oid::from_str(&name)?;
            let commit = repo.find_commit(oid)?;
            let obj = commit.into_object();

            let mut opts = git2::build::CheckoutBuilder::new();
            opts.safe();
            repo.checkout_tree(&obj, Some(&mut opts))?;
            repo.set_head_detached(oid)?;
            return Ok(());
        }

        // Check if it is a tag reference (refs/tags/...)
        if name.starts_with("refs/tags/") {
            let reference = repo.find_reference(&name)?;
            let commit = reference.peel_to_commit()?;
            let obj = commit.clone().into_object();

            let mut opts = git2::build::CheckoutBuilder::new();
            opts.safe();
            repo.checkout_tree(&obj, Some(&mut opts))?;
            repo.set_head_detached(commit.id())?;
            return Ok(());
        }

        // Handle normal branches and remote branches
        let ref_name = if repo.find_branch(&name, git2::BranchType::Local).is_ok() {
            format!("refs/heads/{}", name)
        } else if name.contains('/') && !name.starts_with("refs/") {
            // Handle remote branches: "origin/feature" -> checkout local tracking branch "feature"
            let parts: Vec<&str> = name.splitn(2, '/').collect();
            if parts.len() == 2 {
                let local_name = parts[1];
                if let Ok(local_branch) = repo.find_branch(local_name, git2::BranchType::Local) {
                    local_branch.get().name().unwrap_or("").to_string()
                } else {
                    let remote_ref = format!("refs/remotes/{}", name);
                    let remote_reference = repo.find_reference(&remote_ref)?;
                    let commit = remote_reference.peel_to_commit()?;
                    let mut new_branch = repo.branch(local_name, &commit, false)?;
                    // Logged rather than discarded: without an upstream the
                    // branch shows 0/0 ahead-behind forever, which reads as
                    // "in sync" rather than "not tracked".
                    if let Err(e) = new_branch.set_upstream(Some(&name)) {
                        log::warn!("Failed to set upstream for '{}': {}", local_name, e);
                    }
                    new_branch.get().name().unwrap_or("").to_string()
                }
            } else {
                format!("refs/heads/{}", name)
            }
        } else if name.starts_with("refs/") {
            name.clone()
        } else {
            format!("refs/heads/{}", name)
        };

        let obj = repo.revparse_single(&ref_name)?;
        let mut opts = git2::build::CheckoutBuilder::new();
        opts.safe(); // Prevents checkout if it overwrites local dirty changes
        repo.checkout_tree(&obj, Some(&mut opts))?;

        repo.set_head(&ref_name)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn rename_branch(
    path: String,
    current_name: String,
    new_name: String,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

        let repo = Repository::open(&path)?;
        let mut branch = repo.find_branch(&current_name, git2::BranchType::Local)?;
        branch.rename(&new_name, false)?;
        Ok(())
    })
    .await?
}

/// Branch names that must never be offered for bulk deletion.
///
/// The sweeper deletes remote branches by pushing a deletion to the server, so a
/// mistake here is visible to the whole team and is not undoable from the UI.
const PROTECTED_BRANCH_NAMES: &[&str] = &[
    "main",
    "master",
    "develop",
    "development",
    "trunk",
    "release",
];

/// `name` without its remote, when it is a remote-tracking branch of `remote`.
fn without_remote<'a>(name: &'a str, remote: Option<&str>) -> &'a str {
    remote
        .and_then(|r| name.strip_prefix(r))
        .and_then(|rest| rest.strip_prefix('/'))
        .unwrap_or(name)
}

/// True when a branch must be kept out of a sweep: it is the target itself, in
/// local or remote-tracking form, or one of the well-known long-lived branches.
///
/// `branch_remote` / `target_remote` name the remote when the name is a
/// remote-tracking branch, so only a real remote prefix is stripped. Comparing
/// the last path segment instead made `feature/main` count as `main`.
pub fn is_protected_branch(
    branch_name: &str,
    branch_remote: Option<&str>,
    target_name: &str,
    target_remote: Option<&str>,
) -> bool {
    let bare = without_remote(branch_name, branch_remote);
    bare == without_remote(target_name, target_remote) || PROTECTED_BRANCH_NAMES.contains(&bare)
}

/// The remote a remote-tracking branch short name (`origin/main`) belongs to.
fn remote_of(repo: &Repository, name: &str) -> Option<String> {
    repo.branch_remote_name(&format!("refs/remotes/{}", name))
        .ok()
        .and_then(|buf| buf.as_str().ok().map(str::to_string))
}

#[tauri::command]
pub async fn list_merged_branches(
    path: String,
    target_branch: Option<String>,
) -> Result<Vec<repository::BranchInfo>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || list_merged_branches_sync(&path, target_branch)).await?
}

fn list_merged_branches_sync(
    path: &str,
    target_branch: Option<String>,
) -> Result<Vec<repository::BranchInfo>, AppError> {
    let repo = Repository::open(path)?;

    let target_name = target_branch.unwrap_or_else(|| "HEAD".to_string());
    let target_obj = repo.revparse_single(&target_name)?;
    let target_commit = target_obj.peel_to_commit()?;
    let target_oid = target_commit.id();

    // Sweeping from `HEAD` protects the checked-out branch by name, so its
    // own upstream is never offered for deletion either.
    let target_short = if target_name == "HEAD" {
        repo.head()
            .ok()
            .filter(|h| h.is_branch())
            .and_then(|h| h.shorthand().ok().map(str::to_string))
            .unwrap_or_else(|| target_name.clone())
    } else {
        target_name.clone()
    };
    let target_remote = remote_of(&repo, &target_short);

    let all_branches = repository::list_branches(path)?;
    let mut merged_branches = Vec::new();

    for b in all_branches {
        // Skip HEAD or current branch if it matches target
        if b.is_head {
            continue;
        }
        // Excludes the target in both its local and remote-tracking form,
        // plus the well-known long-lived branches. Without this, sweeping
        // from a feature branch that has `main` merged in would offer
        // `origin/main` for deletion.
        let branch_remote = if b.is_remote {
            remote_of(&repo, &b.name)
        } else {
            None
        };
        if is_protected_branch(
            &b.name,
            branch_remote.as_deref(),
            &target_short,
            target_remote.as_deref(),
        ) {
            continue;
        }

        let branch_oid_res = git2::Oid::from_str(&b.oid);
        if let Ok(b_oid) = branch_oid_res {
            if b_oid == target_oid {
                merged_branches.push(b);
                continue;
            }
            // Check if target_oid is descendant of b_oid (b_oid is ancestor of target_oid)
            if let Ok(is_descendant) = repo.graph_descendant_of(target_oid, b_oid) {
                if is_descendant {
                    merged_branches.push(b);
                }
            }
        }
    }

    Ok(merged_branches)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedBranchScan {
    pub target_ref: String,
    pub target_oid: String,
    pub branches: Vec<repository::BranchInfo>,
}

#[tauri::command]
pub async fn scan_merged_branches(
    path: String,
    target_branch: String,
) -> Result<MergedBranchScan, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let (object, reference) = repo.revparse_ext(&target_branch)?;
        let target_oid = object.peel_to_commit()?.id();
        let reference = reference
            .ok_or_else(|| AppError::invalid_state("Choose a branch as the sweep target."))?
            .resolve()?;
        let target_ref = reference.name()?.to_string();
        let branches = list_merged_branches_sync(&path, Some(target_branch))?;
        if repo.find_reference(&target_ref)?.target() != Some(target_oid) {
            return Err(AppError::invalid_state(
                "The sweep target changed during scanning. Scan again.",
            ));
        }
        Ok(MergedBranchScan {
            target_ref,
            target_oid: target_oid.to_string(),
            branches,
        })
    })
    .await?
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchDeletion {
    pub name: String,
    pub is_remote: bool,
    pub oid: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchDeletionResult {
    pub name: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn delete_merged_branches<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    target_ref: String,
    target_oid: String,
    branches: Vec<BranchDeletion>,
) -> Result<Vec<BranchDeletionResult>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

        let repo = Repository::open(&path)?;
        let expected_target = git2::Oid::from_str(&target_oid)?;
        let mut results = Vec::new();
        for branch in branches {
            let result = (|| -> Result<(), AppError> {
                if !target_ref.starts_with("refs/heads/")
                    && !target_ref.starts_with("refs/remotes/")
                {
                    return Err(AppError::invalid_state(
                        "Choose a branch as the sweep target.",
                    ));
                }
                let target_short = target_ref
                    .strip_prefix("refs/heads/")
                    .or_else(|| target_ref.strip_prefix("refs/remotes/"))
                    .unwrap_or(&target_ref);
                let branch_remote = if branch.is_remote {
                    remote_of(&repo, &branch.name)
                } else {
                    None
                };
                let target_remote = if target_ref.starts_with("refs/remotes/") {
                    remote_of(&repo, target_short)
                } else {
                    None
                };
                if is_protected_branch(
                    &branch.name,
                    branch_remote.as_deref(),
                    target_short,
                    target_remote.as_deref(),
                ) {
                    return Err(AppError::invalid_state(
                        "This branch is protected from sweeping.",
                    ));
                }
                // Lock the target through deletion so it cannot move after ancestry is checked.
                let mut target_lock = repo.transaction()?;
                target_lock.lock_ref(&target_ref)?;
                if repo.find_reference(&target_ref)?.target() != Some(expected_target) {
                    return Err(AppError::invalid_state(
                        "The sweep target changed. Scan again.",
                    ));
                }
                let expected = git2::Oid::from_str(&branch.oid)?;
                if expected != expected_target
                    && !repo.graph_descendant_of(expected_target, expected)?
                {
                    return Err(AppError::invalid_state(
                        "This branch contains work not merged into the sweep target.",
                    ));
                }
                delete_branch_at_tip(
                    &repo,
                    &branch.name,
                    branch.is_remote,
                    Some(expected),
                    ssh_key_path.clone(),
                )
            })();
            results.push(BranchDeletionResult {
                name: branch.name,
                error: result.err().map(|e| e.to_string()),
            });
        }
        Ok(results)
    })
    .await?
}

fn delete_branch_at_tip(
    repo: &Repository,
    name: &str,
    is_remote: bool,
    expected: Option<git2::Oid>,
    ssh_key_path: Option<String>,
) -> Result<(), AppError> {
    if is_remote && remote_of(repo, name).is_none() {
        return Err(AppError::invalid_state(
            "Invalid remote branch name: expected remote/branch",
        ));
    }
    let refname = format!(
        "refs/{}/{}",
        if is_remote { "remotes" } else { "heads" },
        name
    );
    let actual = repo
        .find_reference(&refname)?
        .target()
        .ok_or_else(|| AppError::invalid_state("Branch has no direct tip."))?;
    let expected = expected.unwrap_or(actual);
    if actual != expected {
        return Err(AppError::invalid_state(
            "The selected branch changed. Scan again.",
        ));
    }
    if is_remote {
        let remote_name = remote_of(repo, name).ok_or_else(|| {
            AppError::invalid_state("Invalid remote branch name: expected remote/branch")
        })?;
        let branch_name = name
            .strip_prefix(&format!("{}/", remote_name))
            .ok_or_else(|| AppError::invalid_state("Invalid remote branch name"))?;
        let destination = format!("refs/heads/{}", branch_name);
        let mut remote = repo.find_remote(&remote_name)?;
        crate::git::push::push_refspecs_with_lease(
            repo,
            &mut remote,
            &[&format!(":{}", destination)],
            ssh_key_path,
            None,
            Some(crate::git::push::PushLease {
                refname: destination,
                expected,
            }),
        )?;
        // libgit2 may already have removed the tracking ref. Never remove a newer tip.
        let mut transaction = repo.transaction()?;
        transaction.lock_ref(&refname)?;
        match repo.find_reference(&refname) {
            Ok(reference) if reference.target() == Some(expected) => {
                transaction.remove(&refname)?;
                transaction.commit()?;
            }
            Ok(_) => {}
            Err(e) if e.code() == git2::ErrorCode::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    } else {
        let mut transaction = repo.transaction()?;
        transaction.lock_ref(&refname)?;
        if repo.find_reference(&refname)?.target() != Some(expected) {
            return Err(AppError::invalid_state(
                "The selected branch changed. Scan again.",
            ));
        }
        let common = Repository::open(repo.commondir())?;
        if repo
            .head()
            .ok()
            .is_some_and(|head| head.name().ok() == Some(refname.as_str()))
            || common
                .head()
                .ok()
                .is_some_and(|head| head.name().ok() == Some(refname.as_str()))
        {
            return Err(AppError::invalid_state(
                "Cannot delete a checked-out branch.",
            ));
        }
        for worktree in repo.worktrees()?.iter() {
            let name =
                worktree?.ok_or_else(|| AppError::invalid_state("Worktree name is not UTF-8."))?;
            let worktree = repo.find_worktree(name)?;
            if worktree.validate().is_ok() {
                let linked = Repository::open_from_worktree(&worktree)?;
                if linked
                    .head()
                    .ok()
                    .is_some_and(|head| head.name().ok() == Some(refname.as_str()))
                {
                    return Err(AppError::invalid_state(
                        "Cannot delete a branch checked out in another worktree.",
                    ));
                }
            }
        }
        transaction.remove(&refname)?;
        transaction.commit()?;
        // Configuration cleanup must not turn a completed deletion into a failure.
        let section = format!("branch.{}", name);
        let cwd = repo
            .workdir()
            .unwrap_or_else(|| repo.path())
            .to_string_lossy();
        if let Err(e) =
            crate::commands::git_output(&["config", "--local", "--remove-section", &section], &cwd)
        {
            log::warn!("Branch deleted but config cleanup failed: {}", e);
        }
    }
    Ok(())
}
