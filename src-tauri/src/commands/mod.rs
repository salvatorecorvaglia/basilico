pub mod bisect;
pub mod blame;
pub mod branch;
pub mod commit;
pub mod conflict_resolver;
pub mod diff;
pub mod gpg;
pub mod history;
pub mod log;
pub mod merge;
pub mod rebase;
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

/// Helper function to create a Command configured with standard search paths.
/// On macOS, this ensures Homebrew and standard system binary directories are included in PATH
/// when running as a packaged GUI application.
pub fn new_command(program: &str) -> std::process::Command {
    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new(program);
        if let Ok(current_path) = std::env::var("PATH") {
            let new_path = format!("{}:/opt/homebrew/bin:/usr/local/bin", current_path);
            cmd.env("PATH", new_path);
        }
        cmd
    }
    #[cfg(not(target_os = "macos"))]
    {
        std::process::Command::new(program)
    }
}
