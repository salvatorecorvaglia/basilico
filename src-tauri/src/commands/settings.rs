/* ═══════════════════════════════════════════════════════
Basilico — Settings Commands
User preferences, SSH key management
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    pub theme: String,
    pub ssh_key_path: Option<String>,
    pub git_author_name: Option<String>,
    pub git_author_email: Option<String>,
    pub keyboard_shortcuts: HashMap<String, String>,
}

impl Default for UserSettings {
    fn default() -> Self {
        let mut shortcuts = HashMap::new();
        shortcuts.insert(
            "commandPalette".to_string(),
            "CmdOrCtrl+Shift+P".to_string(),
        );
        shortcuts.insert("openSettings".to_string(), "CmdOrCtrl+,".to_string());
        shortcuts.insert("search".to_string(), "CmdOrCtrl+F".to_string());
        shortcuts.insert("staging".to_string(), "CmdOrCtrl+Shift+S".to_string());
        shortcuts.insert("commit".to_string(), "CmdOrCtrl+Enter".to_string());
        shortcuts.insert("refresh".to_string(), "CmdOrCtrl+R".to_string());

        Self {
            theme: "sage-green".to_string(),
            ssh_key_path: None,
            git_author_name: None,
            git_author_email: None,
            keyboard_shortcuts: shortcuts,
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::settings(format!("Failed to resolve app config dir: {}", e)))?;
    Ok(config_dir.join("settings.json"))
}

pub fn get_custom_ssh_path(app: &tauri::AppHandle) -> Option<String> {
    let path = settings_path(app).ok()?;
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(path).ok()?;
    let settings: serde_json::Value = serde_json::from_str(&content).ok()?;
    settings
        .get("sshKeyPath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<UserSettings, AppError> {
    let path = settings_path(&app)?;

    if !path.exists() {
        return Ok(UserSettings::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::settings(format!("Failed to read settings: {}", e)))?;

    serde_json::from_str(&content)
        .map_err(|e| AppError::settings(format!("Failed to parse settings: {}", e)))
}

#[tauri::command]
pub async fn save_settings(app: tauri::AppHandle, settings: UserSettings) -> Result<(), AppError> {
    let path = settings_path(&app)?;

    // Create parent directory if it doesn't exist
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::settings(format!("Failed to create settings directory: {}", e))
        })?;
    }

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| AppError::settings(format!("Failed to serialize settings: {}", e)))?;

    fs::write(&path, content)
        .map_err(|e| AppError::settings(format!("Failed to write settings: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn generate_ssh_key(comment: String) -> Result<String, AppError> {
    // Sanitize comment to prevent argument injection
    let sanitized_comment: String = comment
        .chars()
        .filter(|c| {
            c.is_alphanumeric() || *c == ' ' || *c == '@' || *c == '.' || *c == '-' || *c == '_'
        })
        .collect();
    if sanitized_comment.is_empty() {
        return Err(AppError::settings(
            "SSH key comment must contain at least one valid character",
        ));
    }
    let home =
        dirs::home_dir().ok_or_else(|| AppError::settings("Could not determine home directory"))?;
    let ssh_dir = home.join(".ssh");
    let key_path = ssh_dir.join("id_basilico");

    // Create .ssh directory if it doesn't exist
    fs::create_dir_all(&ssh_dir)
        .map_err(|e| AppError::settings(format!("Failed to create .ssh directory: {}", e)))?;

    // Check if key already exists
    if key_path.exists() {
        // Read and return the existing public key
        let pub_path = ssh_dir.join("id_basilico.pub");
        return fs::read_to_string(&pub_path).map_err(|e| {
            AppError::settings(format!(
                "Key already exists but failed to read public key: {}",
                e
            ))
        });
    }

    let key_path_str = key_path
        .to_str()
        .ok_or_else(|| AppError::settings("Invalid UTF-8 in key path"))?;

    let output = crate::commands::new_command("ssh-keygen")
        .args([
            "-t",
            "ed25519",
            "-C",
            &sanitized_comment,
            "-f",
            key_path_str,
            "-N",
            "",
        ])
        .output()
        .map_err(|e| AppError::command(format!("Failed to run ssh-keygen: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::command(String::from_utf8_lossy(&output.stderr)));
    }

    // Read and return the public key
    let pub_path = ssh_dir.join("id_basilico.pub");
    fs::read_to_string(&pub_path).map_err(|e| {
        AppError::settings(format!(
            "Generated key but failed to read public key: {}",
            e
        ))
    })
}

#[tauri::command]
pub async fn list_ssh_keys() -> Result<Vec<String>, AppError> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::settings("Could not determine home directory"))?;
    let ssh_dir = home.join(".ssh");

    if !ssh_dir.exists() {
        return Ok(Vec::new());
    }

    let known_key_names = ["id_rsa", "id_ed25519", "id_ecdsa", "id_dsa", "id_basilico"];

    let mut found_keys = Vec::new();

    for name in &known_key_names {
        let key_path = ssh_dir.join(name);
        if key_path.exists() {
            found_keys.push(name.to_string());
        }
    }

    Ok(found_keys)
}
