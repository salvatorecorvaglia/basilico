//! Pushing, shared by branch pushes, remote branch deletion and tag pushes.

use crate::error::AppError;
use git2::{Oid, PushOptions, Remote};

/// Push `refspecs` to `remote`, turning server-side ref rejections into an
/// error.
///
/// `Remote::push` succeeds whenever the transport does, even if the server
/// refused individual ref updates, so rejections are collected through
/// `push_update_reference` and checked afterwards.
pub fn push_refspecs(
    remote: &mut Remote,
    refspecs: &[&str],
    ssh_key_path: Option<String>,
) -> Result<(), AppError> {
    push_refspecs_reporting(remote, refspecs, ssh_key_path, None)
}

/// [`push_refspecs`], reporting progress to (and cancellable through) `op`.
pub fn push_refspecs_reporting(
    remote: &mut Remote,
    refspecs: &[&str],
    ssh_key_path: Option<String>,
    op: Option<&crate::git::progress::NetworkOperation>,
) -> Result<(), AppError> {
    push_refspecs_impl(remote, refspecs, ssh_key_path, op, None)
}

/// An expected old value checked in the actual push connection's negotiation.
#[derive(Clone)]
pub struct PushLease {
    pub refname: String,
    pub expected: Oid,
}

/// Local libgit2 transports do not compare old values at ref-update time.
/// Git's receive-pack supplies that final atomic check for local remotes too.
pub fn push_refspecs_with_lease(
    repo: &git2::Repository,
    remote: &mut Remote,
    refspecs: &[&str],
    ssh_key_path: Option<String>,
    op: Option<&crate::git::progress::NetworkOperation>,
    lease: Option<PushLease>,
) -> Result<(), AppError> {
    let url = remote.pushurl().ok().flatten().or(remote.url().ok());
    let local = url.is_some_and(|url| {
        url.starts_with("file://")
            || std::path::Path::new(url).is_absolute()
            || !url.contains(':')
            || (url.as_bytes().get(1) == Some(&b':') && url.as_bytes()[0].is_ascii_alphabetic())
    });
    if let (true, Some(lease), Some(url)) = (local, lease.as_ref(), url) {
        let [spec] = refspecs else {
            return Err(AppError::invalid_state(
                "A leased push must update exactly one branch.",
            ));
        };
        let (source, destination) =
            spec.trim_start_matches('+')
                .split_once(':')
                .ok_or_else(|| {
                    AppError::invalid_state("A leased push needs an explicit destination.")
                })?;
        if destination != lease.refname {
            return Err(AppError::invalid_state(
                "The push destination does not match its lease.",
            ));
        }
        let new_oid = if source.is_empty() {
            None
        } else {
            Some(repo.revparse_single(source)?.id())
        };
        // Pin the source too, so tracking metadata describes precisely what was pushed.
        let pinned = format!(
            "{}:{}",
            new_oid.map(|oid| oid.to_string()).unwrap_or_default(),
            destination
        );
        let expected = format!("--force-with-lease={}:{}", lease.refname, lease.expected);
        // '+' refspecs override Git's lease. The flag itself permits the rewrite.
        let args = ["push", expected.as_str(), "--", url, pinned.as_str()];
        let cwd = repo
            .workdir()
            .unwrap_or_else(|| repo.path())
            .to_string_lossy();
        let cancellation = op.map(|operation| operation.cancellation());
        let output = crate::commands::git_output_cancellable(&args, &cwd, cancellation.as_deref())?;
        if !output.status.success() {
            return Err(AppError::git(format!(
                "Refusing to force push or delete: {}",
                crate::commands::git_failure_message(&["push", "--force-with-lease"], &output)
            )));
        }
        if let Err(e) = update_tracking_after_push(repo, remote, lease, new_oid) {
            log::warn!(
                "Push succeeded but tracking metadata could not be updated: {}",
                e
            );
        }
        return Ok(());
    }
    push_refspecs_impl(remote, refspecs, ssh_key_path, op, lease)
}

fn update_tracking_after_push(
    repo: &git2::Repository,
    remote: &Remote,
    lease: &PushLease,
    new_oid: Option<Oid>,
) -> Result<(), AppError> {
    for spec in remote.refspecs() {
        if spec.direction() != git2::Direction::Fetch || !spec.src_matches(&lease.refname) {
            continue;
        }
        let name = spec.transform(&lease.refname)?;
        let name = name
            .as_str()
            .map_err(|_| AppError::invalid_state("Tracking ref is not UTF-8."))?;
        let mut transaction = repo.transaction()?;
        transaction.lock_ref(name)?;
        let current = match repo.find_reference(name) {
            Ok(reference) => reference.target(),
            Err(e) if e.code() == git2::ErrorCode::NotFound => continue,
            Err(e) => return Err(e.into()),
        };
        if current != Some(lease.expected) {
            continue;
        }
        match new_oid {
            Some(oid) => transaction.set_target(name, oid, None, "update by push")?,
            None => transaction.remove(name)?,
        }
        transaction.commit()?;
    }
    Ok(())
}

fn push_refspecs_impl(
    remote: &mut Remote,
    refspecs: &[&str],
    ssh_key_path: Option<String>,
    op: Option<&crate::git::progress::NetworkOperation>,
    lease: Option<PushLease>,
) -> Result<(), AppError> {
    let rejections = crate::git::credentials::new_push_rejections();
    let mut push_opts = PushOptions::new();
    let mut callbacks = crate::git::credentials::make_push_callbacks(
        ssh_key_path,
        rejections.clone(),
        op.map(|op| std::rc::Rc::new(std::cell::RefCell::new(op.reporter()))),
        remote.url().ok(),
    );
    if let Some(lease) = lease {
        callbacks.push_negotiation(move |updates| {
            if updates.len() != 1 || updates[0].dst_refname()? != lease.refname || updates[0].src() != lease.expected {
                return Err(git2::Error::from_str("Refusing to force push or delete: the remote branch changed or disappeared. Fetch and review it first."));
            }
            Ok(())
        });
    }
    push_opts.remote_callbacks(callbacks);

    let result = remote.push(refspecs, Some(&mut push_opts));
    match op {
        Some(op) => op.finish(result)?,
        None => result?,
    }
    crate::git::credentials::check_push_rejections(&rejections)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TempRepo;

    #[test]
    fn negotiation_checks_the_advertised_tip_for_updates_and_deletions() {
        let scratch = TempRepo::new();
        let server_path = scratch.path.join("server.git");
        let server = git2::Repository::init_bare(&server_path).unwrap();
        let repo = TempRepo::new();
        repo.write_file("a", "base");
        repo.commit("base");
        let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();
        let refname = format!("refs/heads/{}", branch);
        let mut remote = repo
            .repo
            .remote("origin", server_path.to_str().unwrap())
            .unwrap();
        remote
            .push(&[&format!("{}:{}", refname, refname)], None)
            .unwrap();
        let expected = server.find_reference(&refname).unwrap().target().unwrap();
        let base = server.find_commit(expected).unwrap();
        let sig = git2::Signature::now("Other", "other@example.com").unwrap();
        let moved = server
            .commit(
                Some(&refname),
                &sig,
                &sig,
                "new work",
                &base.tree().unwrap(),
                &[&base],
            )
            .unwrap();
        repo.write_file("a", "rewrite");
        repo.commit("rewrite");
        let update = format!("+{}:{}", refname, refname);
        // Exercise libgit2 negotiation directly; production local pushes use receive-pack.
        for spec in [&update, &format!(":{}", refname)] {
            let result = push_refspecs_impl(
                &mut remote,
                &[spec],
                None,
                None,
                Some(PushLease {
                    refname: refname.clone(),
                    expected,
                }),
            );
            assert!(result.is_err());
            assert_eq!(
                server.find_reference(&refname).unwrap().target(),
                Some(moved)
            );
        }
        push_refspecs_impl(
            &mut remote,
            &[&update],
            None,
            None,
            Some(PushLease {
                refname: refname.clone(),
                expected: moved,
            }),
        )
        .unwrap();
        let pushed = repo.repo.head().unwrap().target().unwrap();
        assert_eq!(
            server.find_reference(&refname).unwrap().target(),
            Some(pushed)
        );
        push_refspecs_impl(
            &mut remote,
            &[&format!(":{}", refname)],
            None,
            None,
            Some(PushLease {
                refname: refname.clone(),
                expected: pushed,
            }),
        )
        .unwrap();
        assert!(server.find_reference(&refname).is_err());
    }
}
