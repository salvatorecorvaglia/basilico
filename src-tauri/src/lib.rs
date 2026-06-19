mod commands;
mod error;
mod git;
mod state;
mod watcher;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Repo commands
            commands::repo::open_repo,
            commands::repo::close_repo,
            commands::repo::get_status,
            commands::repo::list_remotes,
            // Log commands
            commands::log::get_log,
            // Diff commands
            commands::diff::get_workdir_diff,
            commands::diff::get_staged_diff,
            commands::diff::get_commit_diff,
            commands::diff::get_file_diff,
            // Branch commands
            commands::branch::list_branches,
            // Tag commands
            commands::tag::list_tags,
        ])
        .setup(|app| {
            log::info!("Basilico starting...");

            // Set up window
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Basilico");
}
