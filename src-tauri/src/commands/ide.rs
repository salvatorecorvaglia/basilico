/* ═══════════════════════════════════════════════════════
Basilico — IDE Launcher Commands
Opens files and line numbers in external code editors
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use std::process::Command;

#[tauri::command]
pub async fn open_in_ide(
    path: String,
    line: Option<u32>,
    editor: Option<String>,
    repo_path: Option<String>,
) -> Result<(), AppError> {
    // When the caller supplies a repository root, `path` is relative to it and
    // the two are joined here rather than in the renderer — which used a
    // literal "/" and so produced a mixed-separator path on Windows.
    //
    // The join is validated rather than trusted. `Path::join` silently discards
    // `root` when `path` is absolute, and it does not reject `..`, so an
    // unvalidated join let any renderer-supplied path open an arbitrary file —
    // `/Users/me/.ssh/id_ed25519`, say — in the user's editor regardless of
    // which repository the request claimed to be for. `validate_path_no_symlink`
    // is the same guard `blame`, `diff` and the conflict resolver already use.
    let path = match repo_path {
        Some(root) if !root.is_empty() => {
            let root_path = std::path::Path::new(&root);
            let validated = crate::git::utils::validate_path_no_symlink(
                root_path,
                std::path::Path::new(&path),
            )?;
            validated.to_string_lossy().into_owned()
        }
        _ => path,
    };

    // A path starting with '-' would be parsed as a flag by every editor CLI
    // below. Anchoring it to the current directory keeps it positional.
    let path = if path.starts_with('-') {
        format!("./{}", path)
    } else {
        path
    };

    tokio::task::spawn_blocking(move || {
        let editor_name = editor.unwrap_or_else(|| "code".to_string()).to_lowercase();

        let mut cmd: Command;

        match editor_name.as_str() {
            "cursor" => {
                cmd = crate::commands::new_command("cursor");
                if let Some(l) = line {
                    cmd.arg("-g").arg(format!("{}:{}", path, l));
                } else {
                    cmd.arg(&path);
                }
            }
            "webstorm" | "idea" => {
                let bin = if editor_name == "idea" {
                    "idea"
                } else {
                    "webstorm"
                };
                cmd = crate::commands::new_command(bin);
                if let Some(l) = line {
                    cmd.arg("--line").arg(l.to_string()).arg(&path);
                } else {
                    cmd.arg(&path);
                }
            }
            "sublime" | "subl" => {
                cmd = crate::commands::new_command("subl");
                if let Some(l) = line {
                    cmd.arg(format!("{}:{}", path, l));
                } else {
                    cmd.arg(&path);
                }
            }
            "xcode" => {
                #[cfg(target_os = "macos")]
                {
                    cmd = crate::commands::new_command("open");
                    cmd.arg("-a").arg("Xcode").arg(&path);
                }
                #[cfg(not(target_os = "macos"))]
                {
                    return Err(AppError::command("Xcode is only available on macOS"));
                }
            }
            _ => {
                // Default to VS Code
                cmd = crate::commands::new_command("code");
                if let Some(l) = line {
                    cmd.arg("-g").arg(format!("{}:{}", path, l));
                } else {
                    cmd.arg(&path);
                }
            }
        }

        let output = cmd
            .output()
            .map_err(|e| AppError::command(format!("Failed to launch {}: {}", editor_name, e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.is_empty() {
                return Err(AppError::command(format!(
                    "Editor '{}' returned error: {}",
                    editor_name, stderr
                )));
            }
        }

        Ok(())
    })
    .await?
}
