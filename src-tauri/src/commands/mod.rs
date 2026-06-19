pub mod branch;
pub mod commit;
pub mod diff;
pub mod log;
pub mod merge;
pub mod remote;
pub mod repo;
pub mod staging;
pub mod tag;
pub mod blame;
pub mod history;
pub mod reflog;
pub mod stash;
pub mod rebase;
pub mod bisect;
pub mod search;
pub mod worktree;
pub mod submodule;
pub mod settings;
pub mod conflict_resolver;
pub mod gpg;
pub mod stash_inspector;

/// Helper function to create a Command configured with standard search paths.
/// On macOS, this ensures Homebrew and standard system binary directories are included in PATH
/// when running as a packaged GUI application.
pub fn new_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "macos")]
    {
        if let Ok(current_path) = std::env::var("PATH") {
            let new_path = format!("{}:/opt/homebrew/bin:/usr/local/bin", current_path);
            cmd.env("PATH", new_path);
        }
    }
    cmd
}
