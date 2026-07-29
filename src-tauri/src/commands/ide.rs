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
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let editor_name = editor
            .unwrap_or_else(|| "code".to_string())
            .to_lowercase();

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
                let bin = if editor_name == "idea" { "idea" } else { "webstorm" };
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
            "code" | _ => {
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
