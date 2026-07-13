use crate::error::AppError;
use crate::git::repository;
use crate::state::AppState;

#[tauri::command]
pub async fn open_repo(
    app: tauri::AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<repository::RepoInfo, AppError> {
    let info = tokio::task::spawn_blocking(move || repository::open_repo(&path))
        .await
        .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))??;

    // Only register and start watcher if it's not already tracked
    let watcher_id = uuid::Uuid::new_v4().to_string();
    if state.try_add_repo(info.path.clone(), watcher_id.clone()) {
        crate::watcher::start_watching(app, info.path.clone(), watcher_id);
    }

    Ok(info)
}

#[tauri::command]
pub async fn close_repo(path: String, state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    let canonical = std::fs::canonicalize(&path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(path);
    state.remove_repo(&canonical);
    Ok(())
}

#[tauri::command]
pub async fn get_status(path: String) -> Result<repository::RepoStatus, AppError> {
    tokio::task::spawn_blocking(move || repository::get_status(&path))
        .await
        .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn list_remotes(path: String) -> Result<Vec<repository::RemoteInfo>, AppError> {
    tokio::task::spawn_blocking(move || repository::list_remotes(&path))
        .await
        .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

/// Get repository info without registering a watcher.
/// Used by refreshAll to avoid the open_repo side-effect.
#[tauri::command]
pub async fn get_repo_info(path: String) -> Result<repository::RepoInfo, AppError> {
    tokio::task::spawn_blocking(move || repository::open_repo(&path))
        .await
        .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn clone_repo(
    app: tauri::AppHandle,
    url: String,
    path: String,
) -> Result<repository::RepoInfo, AppError> {
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    let info = tokio::task::spawn_blocking(move || {
        let callbacks = crate::git::credentials::make_callbacks(ssh_key_path);
        let mut fetch_opts = git2::FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_opts);

        builder.clone(&url, std::path::Path::new(&path))?;
        repository::open_repo(&path)
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))??;

    Ok(info)
}

#[tauri::command]
pub async fn init_repo(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        git2::Repository::init(std::path::Path::new(&path))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn open_external_tool(path: String, tool: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let path_buf = std::path::PathBuf::from(&path);
        if !path_buf.exists() {
            return Err(AppError::not_found(format!("Directory path does not exist: {}", path)));
        }

        let mut cmd = match tool.as_str() {
            "vscode" => {
                #[cfg(target_os = "macos")]
                {
                    // Try launching via open -a first (highly robust on macOS)
                    let mut c = crate::commands::new_command("open");
                    c.args(["-a", "Visual Studio Code", &path]);
                    if c.status().map(|s| s.success()).unwrap_or(false) {
                        return Ok(());
                    }
                }
                let mut c = crate::commands::new_command("code");
                c.arg(&path);
                c
            }
            "cursor" => {
                #[cfg(target_os = "macos")]
                {
                    // Try launching via open -a first (highly robust on macOS)
                    let mut c = crate::commands::new_command("open");
                    c.args(["-a", "Cursor", &path]);
                    if c.status().map(|s| s.success()).unwrap_or(false) {
                        return Ok(());
                    }
                }
                let mut c = crate::commands::new_command("cursor");
                c.arg(&path);
                c
            }
            "terminal" => {
                #[cfg(target_os = "macos")]
                {
                    // Try iTerm2 first, fallback to macOS Terminal
                    let mut c = crate::commands::new_command("open");
                    c.args(["-a", "iTerm", &path]);
                    if c.status().map(|s| s.success()).unwrap_or(false) {
                        return Ok(());
                    }

                    let mut c = crate::commands::new_command("open");
                    c.args(["-a", "Terminal", &path]);
                    c
                }
                #[cfg(target_os = "windows")]
                {
                    // Try Windows Terminal (wt.exe) first, fallback to cmd.exe
                    let mut c = crate::commands::new_command("wt");
                    c.args(["-d", &path]);
                    if c.status().map(|s| s.success()).unwrap_or(false) {
                        return Ok(());
                    }

                    let mut c = crate::commands::new_command("cmd");
                    c.args(["/c", "start", "cmd", "/K", "cd", "/d", &path]);
                    c
                }
                #[cfg(target_os = "linux")]
                {
                    let terminals = [
                        ("gnome-terminal", vec!["--working-directory"]),
                        ("xfce4-terminal", vec!["--working-directory"]),
                        ("konsole", vec!["--workdir"]),
                        ("alacritty", vec!["--working-directory"]),
                        ("kitty", vec!["--directory"]),
                    ];

                    let mut spawned = false;
                    for (term, args) in terminals {
                        let mut check = crate::commands::new_command("which");
                        check.arg(term);
                        if check.output().map(|o| o.status.success()).unwrap_or(false) {
                            let mut c = crate::commands::new_command(term);
                            for arg in args {
                                c.arg(arg);
                            }
                            c.arg(&path);
                            if c.spawn().is_ok() {
                                spawned = true;
                                break;
                            }
                        }
                    }

                    if !spawned {
                        // Fallback to xdg-open if no terminal emulator was matched
                        let mut c = crate::commands::new_command("xdg-open");
                        c.arg(&path);
                        c
                    } else {
                        return Ok(());
                    }
                }
            }
            _ => {
                return Err(AppError::invalid_state(format!("Unsupported external tool: {}", tool)));
            }
        };

        let run_result = cmd.output();
        match run_result {
            Ok(output) => {
                if !output.status.success() {
                    log::warn!("Command finished with status: {:?}", output.status);
                }
                Ok(())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let friendly_error = match tool.as_str() {
                    "vscode" => "Visual Studio Code command 'code' or application was not found. Please ensure VS Code is installed. If it is installed, open the VS Code Command Palette (Cmd+Shift+P) and run 'Shell Command: Install \'code\' command in PATH'.",
                    "cursor" => "Cursor command 'cursor' or application was not found. Please ensure Cursor is installed. If it is installed, open the Cursor Command Palette (Cmd+Shift+P) and run 'Shell Command: Install \'cursor\' command in PATH'.",
                    "terminal" => "Could not locate a suitable terminal application on your system.",
                    _ => "The requested external tool was not found on your system."
                };
                Err(AppError::not_found(friendly_error))
            }
            Err(e) => {
                Err(AppError::command(format!("Failed to launch {}: {}", tool, e)))
            }
        }
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}
