//! Pushing, shared by branch pushes, remote branch deletion and tag pushes.

use crate::error::AppError;
use git2::{Direction, PushOptions, Remote};

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
    let rejections = crate::git::credentials::new_push_rejections();
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(crate::git::credentials::make_push_callbacks(
        ssh_key_path,
        rejections.clone(),
        op.map(|op| std::rc::Rc::new(std::cell::RefCell::new(op.reporter()))),
        remote.url().ok(),
    ));

    let result = remote.push(refspecs, Some(&mut push_opts));
    match op {
        Some(op) => op.finish(result)?,
        None => result?,
    }
    crate::git::credentials::check_push_rejections(&rejections)
}

/// Where `refname` points on the remote right now, or `None` if the remote
/// has no such ref.
///
/// This asks the server rather than reading `refs/remotes/...`: the local
/// remote-tracking ref only records what the last fetch saw, which is exactly
/// the stale value a force-with-lease check must not trust.
pub fn remote_ref_tip(
    remote: &mut Remote,
    refname: &str,
    ssh_key_path: Option<String>,
    op: Option<&crate::git::progress::NetworkOperation>,
) -> Result<Option<git2::Oid>, AppError> {
    let callbacks = crate::git::credentials::make_callbacks_with_progress(
        ssh_key_path,
        op.map(|op| std::rc::Rc::new(std::cell::RefCell::new(op.reporter()))),
        remote.url().ok(),
    );
    let connection = remote.connect_auth(Direction::Push, Some(callbacks), None)?;
    let tip = connection
        .list()?
        .iter()
        .find(|head| head.name() == refname)
        .map(|head| head.oid());
    Ok(tip)
}
