mod commands;
mod error;
mod git;
mod state;
mod watcher;

#[cfg(test)]
pub mod test_utils;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Repo commands
            commands::repo::open_repo,
            commands::repo::close_repo,
            commands::repo::get_status,
            commands::repo::list_remotes,
            commands::repo::get_repo_info,
            commands::repo::clone_repo,
            commands::repo::init_repo,
            commands::repo::open_external_tool,
            // Log commands
            commands::log::get_log,
            // Diff commands
            commands::diff::get_workdir_diff,
            commands::diff::get_staged_diff,
            commands::diff::get_commit_diff,
            commands::diff::get_file_diff,
            commands::diff::get_file_content_pair,
            commands::diff::get_file_content_at_revision,
            commands::diff::get_compare_diff,
            commands::diff::get_file_content_pair_revisions,
            // Branch commands
            commands::branch::list_branches,
            commands::branch::create_branch,
            commands::branch::delete_branch,
            commands::branch::checkout_branch,
            commands::branch::rename_branch,
            // Tag commands
            commands::tag::list_tags,
            commands::tag::delete_tag,
            commands::tag::create_tag,
            commands::tag::push_tag,
            // Blame commands
            commands::blame::get_file_blame,
            // History commands
            commands::history::get_file_history,
            // Stash commands
            commands::stash::list_stashes,
            commands::stash::save_stash,
            commands::stash::apply_stash,
            commands::stash::pop_stash,
            commands::stash::drop_stash,
            // Staging commands
            commands::staging::stage_files,
            commands::staging::unstage_files,
            commands::staging::apply_patch,
            commands::staging::discard_changes,
            // Commit commands
            commands::commit::create_commit,
            commands::commit::cherry_pick_commit,
            commands::commit::cherry_pick_abort,
            commands::commit::revert_commit,
            commands::commit::revert_abort,
            commands::commit::reset_to_commit,
            commands::commit::get_commit_tree,
            // Merge commands
            commands::merge::merge_branch,
            commands::merge::abort_merge,
            commands::merge::get_conflicts,
            commands::merge::resolve_conflict,
            // Remote commands
            commands::remote::fetch,
            commands::remote::push,
            commands::remote::pull,
            // Rebase commands
            commands::rebase::rebase_init,
            commands::rebase::rebase_write_todo,
            commands::rebase::rebase_step,
            // Bisect commands
            commands::bisect::bisect_start,
            commands::bisect::bisect_mark,
            commands::bisect::bisect_reset,
            // Search commands
            commands::search::search_commits,
            commands::search::grep_code,
            // Worktree commands
            commands::worktree::list_worktrees,
            commands::worktree::add_worktree,
            commands::worktree::remove_worktree,
            commands::worktree::prune_worktrees,
            // Submodule commands
            commands::submodule::list_submodules,
            commands::submodule::init_submodules,
            commands::submodule::update_submodules,
            commands::submodule::sync_submodules,
            commands::submodule::add_submodule,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::generate_ssh_key,
            commands::settings::list_ssh_keys,
            // Conflict resolver commands
            commands::conflict_resolver::get_conflict_stages,
            commands::conflict_resolver::save_merged_resolution,
            // GPG commands
            commands::gpg::get_commit_signature,
            // Stash inspector commands
            commands::stash_inspector::get_stash_diff,
        ])
        .setup(|_app| {
            log::info!("Basilico starting...");

            // Set up window
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Basilico");
}
