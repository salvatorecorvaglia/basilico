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
    pub diff_tool: Option<String>,
    pub merge_tool: Option<String>,
    /// Write-only: never serialized, so it is neither written to
    /// `settings.json` nor sent to the UI. Arriving from the UI it is a new
    /// token to store (empty removes it); read from a `settings.json` written
    /// by an earlier version it is migrated into the credential store. The
    /// token itself lives in [`crate::secrets`].
    #[serde(default, skip_serializing)]
    pub github_pat: Option<String>,
    /// Whether a GitHub token is stored — reported in place of the token.
    #[serde(default)]
    pub has_github_pat: bool,
    pub autolink_pattern: Option<String>,
    pub autolink_url: Option<String>,
    pub bypass_hooks: Option<bool>,
    pub external_editor: Option<String>,
    pub vim_mode_enabled: Option<bool>,
    /// Off by default: a desktop Git client should render correctly offline,
    /// and this makes an unauthenticated request to api.github.com on every
    /// branch switch. Opt-in only.
    pub check_github_ci_status: Option<bool>,
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
            diff_tool: None,
            merge_tool: None,
            github_pat: None,
            has_github_pat: false,
            autolink_pattern: None,
            autolink_url: None,
            bypass_hooks: Some(false),
            external_editor: Some("code".to_string()),
            vim_mode_enabled: Some(false),
            check_github_ci_status: Some(false),
        }
    }
}

/// Write a file readable and writable only by the current user.
///
/// `settings.json` holds the GitHub PAT, so the default umask (which yields
/// world-readable 0644 on Unix) would expose the token to every local account.
/// The mode is applied at creation time so there is no window where the file
/// exists with broader permissions.
///
/// The write is atomic: content goes to a sibling temporary file that is then
/// renamed over `path`. Truncating `path` in place meant a crash or a full
/// disk mid-write left a half-written `settings.json` that failed to parse on
/// every later launch.
pub fn write_private_file(path: &PathBuf, content: &str) -> std::io::Result<()> {
    use std::io::Write;

    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".to_string());
    let tmp_path = path.with_file_name(format!(".{}.{}.tmp", file_name, uuid::Uuid::new_v4()));

    let mut opts = fs::OpenOptions::new();
    // `create_new`: never reuse (or follow a symlink planted at) an existing
    // path for the temporary file.
    opts.write(true).create_new(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }

    let result = (|| {
        let mut file = opts.open(&tmp_path)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        // The renamed file carries the temporary file's 0600 mode, which also
        // repairs broader permissions written by an earlier version.
        fs::rename(&tmp_path, path)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }
    result
}

fn settings_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, AppError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::settings(format!("Failed to resolve app config dir: {}", e)))?;
    Ok(config_dir.join("settings.json"))
}

fn load_settings_from_disk<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<UserSettings, AppError> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(UserSettings::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::settings(format!("Failed to read settings: {}", e)))?;
    Ok(serde_json::from_str(&content)?)
}

/// Write `settings` to `settings.json` (the token is never part of it).
fn write_settings_file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &UserSettings,
) -> Result<(), AppError> {
    let path = settings_path(app)?;
    let content = serde_json::to_string_pretty(settings)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::settings(format!("Failed to create settings directory: {}", e))
        })?;
    }
    write_private_file(&path, &content)
        .map_err(|e| AppError::settings(format!("Failed to write settings: {}", e)))
}

/// Load settings, moving a plaintext token left by an earlier version into
/// the credential store, and report whether a token is stored.
fn load_settings<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<UserSettings, AppError> {
    let mut settings = load_settings_from_disk(app)?;

    if let Some(token) = settings.github_pat.take() {
        if !token.trim().is_empty() {
            match crate::secrets::set_github_pat(&token) {
                // Rewriting drops the token from the file: it is not serialized.
                Ok(()) => write_settings_file(app, &settings)?,
                // Without a credential store the file is left as it is rather
                // than losing the user's token.
                Err(e) => log::warn!(
                    "Could not move the GitHub token out of settings.json: {}",
                    e
                ),
            }
        }
    }

    settings.has_github_pat = crate::secrets::github_pat().ok().flatten().is_some();
    Ok(settings)
}

/// Read one field out of the cached settings, populating the cache on first use.
///
/// `get_custom_ssh_path` and `get_merge_tool` were byte-for-byte identical
/// except for the final field access.
fn with_cached_settings<R: tauri::Runtime, T>(
    app: &tauri::AppHandle<R>,
    read: impl FnOnce(&UserSettings) -> Option<T>,
) -> Option<T> {
    let state = app.try_state::<crate::state::AppState>()?;
    let mut cached = state.settings.lock();
    if cached.is_none() {
        if let Ok(settings) = load_settings(app) {
            *cached = Some(settings);
        }
    }
    cached.as_ref().and_then(read)
}

pub fn get_custom_ssh_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    with_cached_settings(app, |s| s.ssh_key_path.clone())
}

/// The user's configured merge-tool command, read from settings rather than
/// trusted from an IPC parameter.
///
/// `launch_external_merge_tool` executes this value as a program (plus
/// substituted arguments) when it doesn't match a built-in preset name, so it
/// must come from storage the renderer can only reach through `save_settings`
/// — not from a `tool_name` argument a compromised or buggy renderer could
/// set to anything.
pub fn get_merge_tool<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    with_cached_settings(app, |s| s.merge_tool.clone())
}

#[tauri::command]
pub async fn get_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<UserSettings, AppError> {
    // Scoped so the lock is not held across the disk read below.
    {
        let cached = state.settings.lock();
        if let Some(ref settings) = *cached {
            return Ok(settings.clone());
        }
    }

    // Read and parse off the async runtime's threads: this is a blocking file
    // read, and every other command in the app is careful to keep those on the
    // blocking pool.
    let settings = tokio::task::spawn_blocking(move || load_settings(&app)).await??;

    // A concurrent caller may have populated the cache while this was reading.
    // Either value came from the same file, so overwriting is harmless.
    let mut cached = state.settings.lock();
    *cached = Some(settings.clone());
    Ok(settings)
}

#[tauri::command]
pub async fn save_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, crate::state::AppState>,
    settings: UserSettings,
) -> Result<(), AppError> {
    // The credential store and `write_private_file` (which ends in an fsync)
    // can both block, so all of it runs off the async runtime's threads.
    let settings = tokio::task::spawn_blocking(move || -> Result<UserSettings, AppError> {
        let mut settings = settings;

        // A token present in the request is a change: store it, or remove the
        // stored one when it is empty. Absent means "unchanged" — the UI never
        // has the stored token, so it cannot send it back.
        if let Some(token) = settings.github_pat.take() {
            crate::secrets::set_github_pat(&token)?;
        }
        settings.has_github_pat = crate::secrets::github_pat()?.is_some();

        write_settings_file(&app, &settings)?;
        Ok(settings)
    })
    .await??;

    // Update cache
    let mut cached = state.settings.lock();
    *cached = Some(settings);

    Ok(())
}

/// The stored GitHub token, for the one feature that sends it from the UI:
/// the opt-in CI status badge's request to api.github.com.
#[tauri::command]
pub async fn get_github_pat() -> Result<Option<String>, AppError> {
    tokio::task::spawn_blocking(crate::secrets::github_pat).await?
}

#[tauri::command]
pub async fn generate_ssh_key(
    comment: String,
    passphrase: Option<String>,
) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
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
        let home = dirs::home_dir()
            .ok_or_else(|| AppError::settings("Could not determine home directory"))?;
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

        // The key used to be generated with an empty passphrase, always. A
        // passphrase is now optional. `ssh-keygen` takes one non-interactively
        // only as an argument, so it is visible in the process list for the
        // moment the command runs — still far better than an unencrypted key
        // on disk. An encrypted key is used through ssh-agent (see
        // `credentials::make_callbacks`), so the UI tells the user to `ssh-add`.
        let passphrase = passphrase.unwrap_or_default();
        let output = crate::commands::new_command("ssh-keygen")
            .args([
                "-t",
                "ed25519",
                "-C",
                &sanitized_comment,
                "-f",
                key_path_str,
                "-N",
                &passphrase,
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
    })
    .await?
}

#[tauri::command]
pub async fn list_ssh_keys() -> Result<Vec<String>, AppError> {
    tokio::task::spawn_blocking(move || {
        let home = dirs::home_dir()
            .ok_or_else(|| AppError::settings("Could not determine home directory"))?;
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
    })
    .await?
}
