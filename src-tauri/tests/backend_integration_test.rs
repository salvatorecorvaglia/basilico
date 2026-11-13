//! Workflow tests through Tauri's real argument decoder and response serializer.
//! Only the window runtime is mocked; commands, Git, files, index and HEAD are real.
use basilico_lib::{commands, state::AppState, test_utils::TempRepo};
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

struct CommandWindow {
    window: tauri::WebviewWindow<MockRuntime>,
    _app: tauri::App<MockRuntime>,
}

impl CommandWindow {
    fn new() -> Self {
        let app = mock_builder()
            .manage(AppState::new())
            .invoke_handler(tauri::generate_handler![
                commands::repo::get_status,
                commands::repo::close_repo,
                commands::staging::stage_files,
                commands::staging::unstage_files,
                commands::staging::apply_patch,
                commands::commit::create_commit,
                commands::commit::get_amend_commit,
                commands::commit::amend_commit,
                commands::diff::get_file_content_pair,
                commands::blame::get_file_blame,
                commands::search::grep_code,
                commands::stash::save_stash,
                commands::stash::list_stashes,
                commands::stash::apply_stash,
                commands::stash::drop_stash,
            ])
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        Self { window, _app: app }
    }

    fn invoke(&self, command: &str, body: Value) -> Result<Value, Value> {
        tauri::test::get_ipc_response(
            &self.window,
            tauri::webview::InvokeRequest {
                cmd: command.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: if cfg!(windows) {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap(),
                body: tauri::ipc::InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.into(),
            },
        )
        .map(|response| response.deserialize().unwrap())
    }

    fn ok(&self, command: &str, body: Value) -> Value {
        self.invoke(command, body)
            .unwrap_or_else(|error| panic!("{command}: {error}"))
    }
}

#[test]
fn staging_commit_and_pinned_amend_preserve_unselected_work_through_ipc() {
    let repo = TempRepo::new();
    repo.write_file("selected.txt", "original\n");
    repo.write_file("private.txt", "keep me\n");
    repo.commit("base");
    let window = CommandWindow::new();
    let path = repo.path_str();
    repo.write_file("selected.txt", "staged version\n");
    repo.write_file("private.txt", "unselected local work\n");
    window.ok(
        "stage_files",
        json!({ "path": path, "files": ["selected.txt"] }),
    );
    let status = window.ok("get_status", json!({ "path": path }));
    assert_eq!(status["staged"][0]["path"], "selected.txt");
    assert_eq!(status["unstaged"][0]["path"], "private.txt");
    // A later edit must remain unstaged and survive both commit operations.
    repo.write_file("selected.txt", "newer local version\n");
    let pair = window.ok("get_file_content_pair", json!({ "path": path, "filePath": "selected.txt", "isStaged": false, "originalPath": null }));
    assert_eq!(pair["original"], "staged version\n");
    assert_eq!(pair["modified"], "newer local version\n");
    let oid = window.ok("create_commit", json!({ "path": path, "message": "selected only", "authorName": null, "authorEmail": null, "amend": false, "bypassHooks": true }));
    let snapshot = window.ok("get_amend_commit", json!({ "path": path }));
    assert_eq!(snapshot["oid"], oid);
    let amended = window.ok("amend_commit", json!({ "path": path, "message": "corrected title", "authorName": null, "authorEmail": null, "bypassHooks": true, "expectedHeadOid": oid }));
    let stale = window.invoke("amend_commit", json!({ "path": path, "message": "stale editor", "authorName": null, "authorEmail": null, "bypassHooks": true, "expectedHeadOid": snapshot["oid"] })).unwrap_err();
    assert_eq!(stale["kind"], "InvalidState");
    assert!(stale["message"].as_str().unwrap().contains("HEAD changed"));
    let fresh = git2::Repository::open(&repo.path).unwrap();
    let head = fresh.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head.id().to_string(), amended.as_str().unwrap());
    assert_eq!(head.message().unwrap(), "corrected title");
    assert_eq!(head.parent_count(), 1);
    let tree = head.tree().unwrap();
    assert_eq!(
        tree.get_path(std::path::Path::new("selected.txt"))
            .unwrap()
            .to_object(&fresh)
            .unwrap()
            .as_blob()
            .unwrap()
            .content(),
        b"staged version\n"
    );
    assert_eq!(
        std::fs::read_to_string(repo.path.join("selected.txt")).unwrap(),
        "newer local version\n"
    );
    assert_eq!(
        std::fs::read_to_string(repo.path.join("private.txt")).unwrap(),
        "unselected local work\n"
    );
}

#[test]
fn partial_staging_and_unstaging_round_trip_the_real_index_through_ipc() {
    let repo = TempRepo::new();
    repo.write_file("file.txt", "one\ntwo\nthree\n");
    repo.commit("base");
    repo.write_file("file.txt", "ONE\ntwo\nTHREE\n");
    let window = CommandWindow::new();
    let path = repo.path_str();
    let patch = "diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,3 @@\n-one\n+ONE\n two\n three\n";
    window.ok(
        "apply_patch",
        json!({ "path": path, "patch": patch, "location": "index" }),
    );
    let pair = window.ok(
        "get_file_content_pair",
        json!({ "path": path, "filePath": "file.txt", "isStaged": true }),
    );
    assert_eq!(pair["original"], "one\ntwo\nthree\n");
    assert_eq!(pair["modified"], "ONE\ntwo\nthree\n");
    window.ok(
        "unstage_files",
        json!({ "path": path, "files": ["file.txt"] }),
    );
    let status = window.ok("get_status", json!({ "path": path }));
    assert_eq!(status["staged"], json!([]));
    assert_eq!(status["unstaged"][0]["path"], "file.txt");
    assert_eq!(
        std::fs::read_to_string(repo.path.join("file.txt")).unwrap(),
        "ONE\ntwo\nTHREE\n"
    );
    let error = window
        .invoke(
            "stage_files",
            json!({ "path": path, "files": ["../escape"] }),
        )
        .unwrap_err();
    assert!(error["message"].is_string());
    assert!(error["kind"].is_string());
    window.ok("close_repo", json!({ "path": path }));
    assert_eq!(
        window
            .invoke("get_status", json!({ "path": path }))
            .unwrap_err()["kind"],
        "InvalidState"
    );
}

#[test]
fn searching_then_blaming_uses_working_tree_line_numbers_through_ipc() {
    let repo = TempRepo::new();
    repo.write_file("source.txt", "committed line\nneedle original\n");
    repo.commit("base");
    repo.write_file(
        "source.txt",
        "new local line\ncommitted line\nneedle original\n",
    );
    let window = CommandWindow::new();
    let path = repo.path_str();
    let matches = window.ok("grep_code", json!({ "repoPath": path, "query": "needle" }));
    assert_eq!(matches[0]["filePath"], "source.txt");
    assert_eq!(matches[0]["lineNumber"], 3);
    assert_eq!(matches[0]["truncated"], false);
    let blame = window.ok(
        "get_file_blame",
        json!({ "path": path, "filePath": matches[0]["filePath"], "commitOid": null }),
    );
    assert_eq!(blame[0]["commitOid"], "");
    assert_eq!(blame[2]["lineNo"], matches[0]["lineNumber"]);
    assert_eq!(blame[2]["lineContent"], "needle original");
    assert_eq!(
        blame[2]["commitOid"],
        repo.repo.head().unwrap().target().unwrap().to_string()
    );
}

#[test]
fn stashes_are_selected_by_oid_after_the_list_changes_through_ipc() {
    let repo = TempRepo::new();
    repo.write_file("file.txt", "base\n");
    repo.commit("base");
    let window = CommandWindow::new();
    let path = repo.path_str();
    repo.write_file("file.txt", "first stash\n");
    window.ok(
        "save_stash",
        json!({ "path": path, "message": "first", "includeUntracked": false }),
    );
    let first = window.ok("list_stashes", json!({ "path": path }))[0]["oid"].clone();
    repo.write_file("file.txt", "second stash\n");
    window.ok(
        "save_stash",
        json!({ "path": path, "message": "second", "includeUntracked": false }),
    );
    window.ok(
        "apply_stash",
        json!({ "path": path, "index": 0, "expectedOid": first }),
    );
    assert_eq!(
        std::fs::read_to_string(repo.path.join("file.txt")).unwrap(),
        "first stash\n"
    );
    window.ok(
        "drop_stash",
        json!({ "path": path, "index": 0, "expectedOid": first }),
    );
    let remaining = window.ok("list_stashes", json!({ "path": path }));
    assert_eq!(remaining.as_array().unwrap().len(), 1);
    assert!(remaining[0]["message"].as_str().unwrap().contains("second"));
}
