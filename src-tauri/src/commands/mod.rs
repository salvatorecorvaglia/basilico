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
/// On macOS, this ensures standard system binary directories are included in PATH
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
            let new_path = format!("{}:/usr/local/bin", current_path);
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
    git_output_cancellable(args, cwd, None)
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

/// Run a captured subprocess with a deadline and optional operation cancellation.
/// Drain both pipes concurrently so a verbose child cannot deadlock the caller.
pub fn command_output(
    mut command: std::process::Command,
    timeout: std::time::Duration,
    cancelled: Option<&std::sync::atomic::AtomicBool>,
) -> Result<std::process::Output, crate::error::AppError> {
    use std::sync::atomic::Ordering;
    if cancelled.is_some_and(|flag| flag.load(Ordering::SeqCst)) {
        return Err(crate::error::AppError::invalid_state(
            "The operation was cancelled.",
        ));
    }
    let child = command
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    wait_for_command_output(child, timeout, cancelled)
}

pub fn wait_for_command_output(
    mut child: std::process::Child,
    timeout: std::time::Duration,
    cancelled: Option<&std::sync::atomic::AtomicBool>,
) -> Result<std::process::Output, crate::error::AppError> {
    use std::io::Read;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let oversized = Arc::new(AtomicBool::new(false));
    let read = |pipe: Option<Box<dyn Read + Send>>| {
        let oversized = Arc::clone(&oversized);
        let (tx, rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let result = (|| {
                let mut bytes = Vec::new();
                if let Some(mut pipe) = pipe {
                    const OUTPUT_LIMIT: u64 = 16 * 1024 * 1024;
                    pipe.by_ref()
                        .take(OUTPUT_LIMIT + 1)
                        .read_to_end(&mut bytes)?;
                    if bytes.len() as u64 > OUTPUT_LIMIT {
                        oversized.store(true, Ordering::SeqCst);
                        // Drain while the supervisor stops the process tree.
                        std::io::copy(&mut pipe, &mut std::io::sink())?;
                    }
                }
                Ok::<_, std::io::Error>(bytes)
            })();
            let _ = tx.send(result);
        });
        (worker, rx)
    };
    let (stdout_worker, stdout_rx) =
        read(stdout.map(|pipe| Box::new(pipe) as Box<dyn Read + Send>));
    let (stderr_worker, stderr_rx) =
        read(stderr.map(|pipe| Box::new(pipe) as Box<dyn Read + Send>));
    let deadline = Instant::now() + timeout;
    let mut status = None;
    let mut stdout = None;
    let mut stderr = None;
    let mut stopped = None;
    loop {
        if stdout.is_none() {
            stdout = stdout_rx.try_recv().ok();
        }
        if stderr.is_none() {
            stderr = stderr_rx.try_recv().ok();
        }
        if status.is_none() {
            match child.try_wait() {
                Ok(Some(value)) => status = Some(Ok(value)),
                Ok(None) => {}
                Err(error) => {
                    stop_child(&mut child);
                    let _ = child.wait();
                    status = Some(Err(error));
                    break;
                }
            }
        }
        if status.is_some() && stdout.is_some() && stderr.is_some() {
            break;
        }
        if oversized.load(Ordering::SeqCst) {
            stopped = Some("Command output exceeds the 16 MB display limit. Narrow the operation.");
        } else if cancelled.is_some_and(|flag| flag.load(Ordering::SeqCst)) {
            stopped = Some("The operation was cancelled.");
        } else if Instant::now() >= deadline {
            stopped = Some("The command timed out. Check the repository state before retrying.");
        }
        if stopped.is_some() {
            stop_child(&mut child);
            if status.is_none() {
                status = Some(child.wait());
            }
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    // On success leave properly detached hook/helper processes alone. On cancellation
    // or timeout the process group has been stopped before its pipes are joined.
    stdout_worker
        .join()
        .map_err(|_| crate::error::AppError::command("Could not collect command output"))?;
    stderr_worker
        .join()
        .map_err(|_| crate::error::AppError::command("Could not collect command errors"))?;
    if oversized.load(Ordering::SeqCst) {
        return Err(crate::error::AppError::command(
            "Command output exceeds the 16 MB display limit. Narrow the operation.",
        ));
    }
    if let Some(message) = stopped {
        return Err(crate::error::AppError::command(message));
    }
    let stdout = stdout
        .or_else(|| stdout_rx.try_recv().ok())
        .ok_or_else(|| crate::error::AppError::command("Command output reader stopped"))??;
    let stderr = stderr
        .or_else(|| stderr_rx.try_recv().ok())
        .ok_or_else(|| crate::error::AppError::command("Command error reader stopped"))??;
    Ok(std::process::Output {
        status: status.ok_or_else(|| crate::error::AppError::command("Command did not exit"))??,
        stdout,
        stderr,
    })
}

/// Feed stdin concurrently with output collection (signers may write before reading).
pub fn command_output_with_input(
    mut command: std::process::Command,
    input: Vec<u8>,
    timeout: std::time::Duration,
) -> Result<std::process::Output, crate::error::AppError> {
    use std::io::Write;
    let mut child = command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    let stdin = child.stdin.take();
    let writer = std::thread::spawn(move || -> std::io::Result<()> {
        if let Some(mut stdin) = stdin {
            stdin.write_all(&input)?;
        }
        Ok(())
    });
    let result = wait_for_command_output(child, timeout, None);
    let written = writer
        .join()
        .map_err(|_| crate::error::AppError::command("Command input writer stopped"))?;
    let output = result?;
    if output.status.success() {
        written?;
    }
    Ok(output)
}

fn stop_child(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        let _ = new_command("taskkill")
            .args(["/F", "/T", "/PID", &child.id().to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    #[cfg(unix)]
    stop_process_group(child.id());
    let _ = child.kill();
}

#[cfg(unix)]
fn stop_process_group(pid: u32) {
    unsafe extern "C" {
        fn kill(pid: i32, signal: i32) -> i32;
    }
    // `new_command` starts Unix children in their own session; never signal our own group.
    unsafe {
        kill(-(pid as i32), 9);
    }
}

pub fn git_output_cancellable(
    args: &[&str],
    cwd: &str,
    cancelled: Option<&std::sync::atomic::AtomicBool>,
) -> Result<std::process::Output, crate::error::AppError> {
    let mut command = new_command("git");
    command.current_dir(cwd).args(args);
    command_output(command, std::time::Duration::from_secs(300), cancelled)
}

#[cfg(all(test, unix))]
mod command_lifecycle_tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::time::{Duration, Instant};

    #[test]
    fn timeout_terminates_the_child_and_its_pipe_holding_descendants() {
        let mut command = new_command("sh");
        command.args(["-c", "sleep 30 & wait"]);
        let start = Instant::now();
        let error = command_output(command, Duration::from_millis(60), None).unwrap_err();
        assert!(error.message.contains("timed out"));
        assert!(start.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn cancellation_terminates_a_running_subprocess() {
        let cancelled = Arc::new(AtomicBool::new(false));
        let flag = cancelled.clone();
        let cancelling = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(80));
            flag.store(true, Ordering::SeqCst);
        });
        let mut command = new_command("sh");
        command.args(["-c", "sleep 30"]);
        let start = Instant::now();
        let error = command_output(command, Duration::from_secs(10), Some(&cancelled)).unwrap_err();
        cancelling.join().unwrap();
        assert!(error.message.contains("cancelled"));
        assert!(start.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn oversized_output_is_rejected_and_the_child_is_reaped() {
        let mut command = new_command("sh");
        command.args(["-c", "head -c 20000000 /dev/zero"]);
        let error = command_output(command, Duration::from_secs(10), None).unwrap_err();
        assert!(error.message.contains("display limit"));
    }

    #[test]
    fn both_captured_pipes_are_drained_without_deadlock() {
        let mut command = new_command("sh");
        command.args(["-c", "i=0; while [ $i -lt 10000 ]; do echo output-line; echo error-line >&2; i=$((i+1)); done"]);
        let output = command_output(command, Duration::from_secs(10), None).unwrap();
        assert!(output.status.success());
        assert!(output.stdout.len() > 65536);
        assert!(output.stderr.len() > 65536);
    }
}
