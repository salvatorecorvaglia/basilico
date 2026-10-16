pub mod bisect;
pub mod blame;
pub mod branch;
pub mod commit;
pub mod conflict_resolver;
pub mod diff;
pub mod doctor;
pub mod gpg;
pub mod history;
pub mod ide;
pub mod log;
pub mod merge;
pub mod patch;
pub mod rebase;
pub mod reflog;
pub mod remote;
pub mod repo;
pub mod search;
pub mod settings;
pub mod staging;
pub mod stash;
pub mod stash_inspector;
pub mod submodule;
pub mod tag;
pub mod worktree;

/// Reject a user-supplied string git would read as an option.
///
/// Positional arguments that begin with `-` are parsed by git as flags, and
/// several subcommands expose flags that execute arbitrary commands —
/// `rebase --exec`, `clone/submodule add --upload-pack`, `format-patch
/// --output-directory`. Every value that reaches a git argv slot from the
/// frontend must pass through here, or be preceded by a `--` separator.
pub fn validate_git_argument(value: &str, label: &str) -> Result<(), crate::error::AppError> {
    if value.is_empty() {
        return Err(crate::error::AppError::invalid_state(format!(
            "{} must not be empty",
            label
        )));
    }
    if value.starts_with('-') {
        return Err(crate::error::AppError::invalid_state(format!(
            "{} must not start with a hyphen",
            label
        )));
    }
    Ok(())
}

/// Helper function to create a Command configured with standard search paths.
/// On macOS, this ensures Homebrew and standard system binary directories are included in PATH
/// when running as a packaged GUI application.
pub fn new_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    // Use UTF-8 locale instead of C locale to support Unicode filenames
    cmd.env("LANG", "en_US.UTF-8").env("LC_ALL", "en_US.UTF-8");
    // Nothing spawned from here may wait for keyboard input. These processes
    // run on the blocking pool with output captured, so a credential prompt
    // (or anything else reading stdin) would block that thread forever and
    // leave the UI spinning with nothing on screen to answer. With stdin
    // closed and git's own terminal prompt disabled, such a process fails
    // with an error the user can act on instead. Callers that feed a process
    // input (gpg signing) replace stdin with a pipe after this.
    cmd.stdin(std::process::Stdio::null());
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    // ssh and pinentry don't prompt on stdin: they open the controlling
    // terminal directly. When Basilico was started from a shell it has one, so
    // an SSH host-key or passphrase prompt would appear in (and wait on) that
    // terminal. Starting a new session drops the controlling terminal, so such
    // a prompt fails at once instead. This is used in place of
    // `GIT_SSH_COMMAND="ssh -o BatchMode=yes"`, which would override the
    // user's own `core.sshCommand`.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        extern "C" {
            fn setsid() -> i32;
        }
        // SAFETY: runs in the forked child before exec; `setsid` is
        // async-signal-safe and touches no Rust state. Its only failure
        // (already a group leader) leaves the child as it was, which is fine.
        unsafe {
            cmd.pre_exec(|| {
                setsid();
                Ok(())
            });
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(current_path) = std::env::var("PATH") {
            let new_path = format!("{}:/opt/homebrew/bin:/usr/local/bin", current_path);
            cmd.env("PATH", new_path);
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Run a git subcommand in `cwd` and return its trimmed stdout.
///
/// Prefer this over hand-rolling `new_command("git") … .output()`: it gives
/// uniform exit-status handling, so a failure can never be mistaken for an
/// empty result set. Callers that need the exit code itself (`git grep` exits
/// 1 for "no matches") or a non-`GitError` kind should use [`git_output`] with
/// [`git_failure_message`] instead.
pub fn run_git_cmd(args: &[&str], cwd: &str) -> Result<String, crate::error::AppError> {
    let output = git_output(args, cwd)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(crate::error::AppError::git(git_failure_message(
            args, &output,
        )))
    }
}

/// Run a git subcommand and hand back the raw output for callers that need to
/// inspect the exit code themselves (`git grep` exits 1 for "no matches").
pub fn git_output(
    args: &[&str],
    cwd: &str,
) -> Result<std::process::Output, crate::error::AppError> {
    let mut cmd = new_command("git");
    cmd.current_dir(cwd);
    cmd.args(args);

    cmd.output().map_err(|e| {
        crate::error::AppError::command(format!("Failed to execute git {:?}: {}", args, e))
    })
}

/// Build a diagnostic from a failed git invocation, preferring stderr but
/// falling back to stdout — some subcommands report failures on stdout.
pub fn git_failure_message(args: &[&str], output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };

    if detail.is_empty() {
        format!("git {:?} failed with no output", args)
    } else {
        format!("git {:?} failed: {}", args, detail)
    }
}
