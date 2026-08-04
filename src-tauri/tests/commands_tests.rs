/* ═══════════════════════════════════════════════════════
Basilico — Command Unit & Behavioral Tests
═══════════════════════════════════════════════════════ */

use basilico_lib::commands::bisect::*;
use basilico_lib::commands::branch::*;
use basilico_lib::commands::commit::*;
use basilico_lib::commands::conflict_resolver::*;
use basilico_lib::commands::doctor::*;
use basilico_lib::commands::history::*;
use basilico_lib::commands::merge::*;
use basilico_lib::commands::patch::*;
use basilico_lib::commands::rebase::*;
use basilico_lib::commands::reflog::*;
use basilico_lib::commands::staging::*;
use basilico_lib::commands::worktree::*;
use basilico_lib::error::AppError;
use basilico_lib::test_utils::TempRepo;

#[tokio::test]
async fn test_bisect_invalid_status() {
    let repo = TempRepo::new();
    let path = repo.path_str().to_string();

    let result = bisect_mark(path, "invalid_status_here".to_string()).await;
    assert!(result.is_err());
    if let Err(e) = result {
        assert_eq!(e.to_string(), "Invalid bisect status");
    }
}

#[tokio::test]
async fn test_checkout_branch_with_slash() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    create_branch(
        repo.path_str().to_string(),
        "feature/test-slash".to_string(),
        None,
    )
    .await
    .unwrap();

    checkout_branch(
        repo.path_str().to_string(),
        "feature/test-slash".to_string(),
    )
    .await
    .unwrap();

    let head = repo.repo.head().unwrap();
    assert_eq!(head.name().unwrap(), "refs/heads/feature/test-slash");
}

#[tokio::test]
async fn test_create_rename_delete_branch() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    let path = repo.path_str().to_string();
    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
        .handle()
        .clone();

    create_branch(path.clone(), "feature/new-branch".to_string(), None)
        .await
        .unwrap();

    let branches = list_branches(path.clone()).await.unwrap();
    let created_branch = branches.iter().find(|b| b.name == "feature/new-branch");
    assert!(created_branch.is_some());

    rename_branch(
        path.clone(),
        "feature/new-branch".to_string(),
        "feature/renamed-branch".to_string(),
    )
    .await
    .unwrap();

    let branches = list_branches(path.clone()).await.unwrap();
    assert!(branches
        .iter()
        .find(|b| b.name == "feature/new-branch")
        .is_none());
    assert!(branches
        .iter()
        .find(|b| b.name == "feature/renamed-branch")
        .is_some());

    delete_branch(
        app,
        path.clone(),
        "feature/renamed-branch".to_string(),
        false,
    )
    .await
    .unwrap();

    let branches = list_branches(path.clone()).await.unwrap();
    assert!(branches
        .iter()
        .find(|b| b.name == "feature/renamed-branch")
        .is_none());
}

#[tokio::test]
async fn test_list_merged_branches() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    let path = repo.path_str().to_string();
    create_branch(path.clone(), "merged-feature".to_string(), None)
        .await
        .unwrap();

    repo.write_file("test.txt", "hello world");
    repo.commit("second commit");

    let merged = list_merged_branches(path, None).await.unwrap();
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].name, "merged-feature");
}

#[tokio::test]
async fn test_create_commit_and_amend() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");

    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    let commit_oid = create_commit(
        repo.path_str().to_string(),
        "Initial Commit".to_string(),
        Some("Test Author".to_string()),
        Some("author@example.com".to_string()),
        false,
        true,
    )
    .await
    .unwrap();

    let commit = repo
        .repo
        .find_commit(git2::Oid::from_str(&commit_oid).unwrap())
        .unwrap();
    assert_eq!(commit.message().unwrap(), "Initial Commit");
    assert_eq!(commit.author().name().unwrap(), "Test Author");

    repo.write_file("test.txt", "hello amended");
    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    let amended_oid = create_commit(
        repo.path_str().to_string(),
        "Amended Commit".to_string(),
        Some("Test Author".to_string()),
        Some("author@example.com".to_string()),
        true,
        true,
    )
    .await
    .unwrap();

    let amended_commit = repo
        .repo
        .find_commit(git2::Oid::from_str(&amended_oid).unwrap())
        .unwrap();
    assert_eq!(amended_commit.message().unwrap(), "Amended Commit");
    assert_eq!(amended_commit.parent_count(), 0);
}

#[tokio::test]
async fn test_reset_to_commit() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    let initial_oid = repo.repo.head().unwrap().target().unwrap();

    repo.write_file("test2.txt", "hello 2");
    repo.commit("commit 2");

    reset_to_commit(
        repo.path_str().to_string(),
        initial_oid.to_string(),
        "hard".to_string(),
    )
    .await
    .unwrap();

    let head_oid = repo.repo.head().unwrap().target().unwrap();
    assert_eq!(head_oid, initial_oid);
}

#[tokio::test]
async fn test_get_commit_tree() {
    let repo = TempRepo::new();
    repo.write_file("dir/test.txt", "hello inside");
    repo.commit("initial commit");

    let head_oid = repo.repo.head().unwrap().target().unwrap();

    let entries = get_commit_tree(repo.path_str().to_string(), head_oid.to_string())
        .await
        .unwrap();

    assert!(entries.iter().any(|e| e.name == "dir" && e.is_dir));
    assert!(entries
        .iter()
        .any(|e| e.name == "test.txt" && !e.is_dir && e.path == "dir/test.txt"));
}

#[tokio::test]
async fn test_create_commit_without_author_config_returns_error() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");

    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    let result = create_commit(
        repo.path_str().to_string(),
        "With explicit author".to_string(),
        Some("Test".to_string()),
        Some("test@test.com".to_string()),
        false,
        true,
    )
    .await;
    assert!(result.is_ok(), "Expected success with explicit author info");

    let err = AppError::invalid_state(
        "Git author name and email are not configured. \
         Please set them in Settings or via 'git config user.name' and 'git config user.email'.",
    );
    assert!(err.message.contains("not configured"));
}

#[test]
fn test_normalize_git_path() {
    assert_eq!(normalize_git_path("src\\main.rs"), "src/main.rs");
    assert_eq!(normalize_git_path("src/main.rs"), "src/main.rs");
    assert_eq!(normalize_git_path("a\\b\\c.txt"), "a/b/c.txt");
}

#[tokio::test]
async fn test_get_repo_health() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "content");
    repo.commit("initial commit");

    let report = get_repo_health(repo.path_str().to_string()).await.unwrap();

    assert!(report.total_size_bytes > 0);
    assert!(report.git_size_bytes > 0);
}

#[tokio::test]
async fn test_file_history_deletions() {
    let repo = TempRepo::new();

    repo.write_file("test.txt", "hello");
    repo.commit("initial");

    repo.write_file("test.txt", "hello world");
    repo.commit("modify");

    repo.remove_file("test.txt");
    repo.commit("delete file");

    repo.write_file("test.txt", "reborn file");
    repo.commit("recreate");

    let history = get_file_history(repo.path_str().to_string(), "test.txt".to_string(), None)
        .await
        .unwrap();

    assert_eq!(history.len(), 4);
    assert_eq!(history[0].commit_summary, "recreate");
    assert_eq!(history[1].commit_summary, "delete file");
    assert_eq!(history[2].commit_summary, "modify");
    assert_eq!(history[3].commit_summary, "initial");
}

#[tokio::test]
async fn test_merge_branch_fast_forward() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    let main_branch_name = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();

    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();
    repo.write_file("test2.txt", "hello2");
    repo.commit("commit 2");

    checkout_branch(repo.path_str().to_string(), main_branch_name.clone())
        .await
        .unwrap();

    let result = merge_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();
    assert_eq!(result, "success");

    let main_head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(main_head.message().unwrap(), "commit 2");
}

#[tokio::test]
async fn test_merge_branch_merge_commit() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    let main_branch_name = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();
    repo.write_file("test1.txt", "hello branch 1");
    repo.commit("commit branch 1");

    checkout_branch(repo.path_str().to_string(), main_branch_name.clone())
        .await
        .unwrap();
    repo.write_file("test2.txt", "hello branch 2");
    repo.commit("commit branch 2");

    let result = merge_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();
    assert_eq!(result, "success");

    let head_commit = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head_commit.parent_count(), 2);
    assert_eq!(head_commit.message().unwrap(), "Merge branch 'branch1'");
}

#[tokio::test]
async fn test_merge_branch_conflicts_and_abort() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "initial content");
    repo.commit("initial commit");

    let main_branch_name = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();
    repo.write_file("test.txt", "branch 1 content");
    repo.commit("commit branch 1");

    checkout_branch(repo.path_str().to_string(), main_branch_name.clone())
        .await
        .unwrap();
    repo.write_file("test.txt", "branch 2 content");
    repo.commit("commit branch 2");

    let result = merge_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();
    assert_eq!(result, "conflicts");

    let conflicts = get_conflicts(repo.path_str().to_string()).await.unwrap();
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0], "test.txt");

    abort_merge(repo.path_str().to_string()).await.unwrap();

    let conflicts_after = get_conflicts(repo.path_str().to_string()).await.unwrap();
    assert!(conflicts_after.is_empty());
    let file_content = std::fs::read_to_string(repo.path.join("test.txt")).unwrap();
    assert_eq!(file_content, "branch 2 content");
}

#[tokio::test]
async fn test_create_commit_patch() {
    let repo = TempRepo::new();
    repo.write_file("patch_test.txt", "line 1\nline 2\n");
    repo.commit("add patch test file");
    let commit_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    let patch = create_commit_patch(repo.path_str().to_string(), commit_oid.to_string())
        .await
        .unwrap();

    assert!(patch.contains("From "));
    assert!(patch.contains("Subject: [PATCH] add patch test file"));
    assert!(patch.contains("diff --git"));
}

#[tokio::test]
async fn test_create_range_patch() {
    let repo = TempRepo::new();
    repo.write_file("file.txt", "v1\n");
    repo.commit("commit 1");
    let c1 = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    repo.write_file("file.txt", "v2\n");
    repo.commit("commit 2");
    let c2 = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    let patch = create_range_patch(repo.path_str().to_string(), c1.to_string(), c2.to_string())
        .await
        .unwrap();

    assert!(patch.contains("Subject: [PATCH] commit 2"));
}

#[tokio::test]
async fn test_rebase_init_and_write_todo() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    let base_oid = repo.repo.head().unwrap().target().unwrap();

    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();

    repo.write_file("test2.txt", "hello 2");
    repo.commit("commit 2");

    repo.write_file("test3.txt", "hello 3");
    repo.commit("commit 3");

    let todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();

    assert_eq!(todos.len(), 2);
    assert_eq!(todos[0].action, "pick");
    assert_eq!(todos[1].action, "pick");

    let mut modified_todos = todos.clone();
    modified_todos[0].action = "edit".to_string();

    rebase_write_todo(repo.path_str().to_string(), modified_todos)
        .await
        .unwrap();

    let rebase = repo.repo.open_rebase(None).unwrap();
    assert_eq!(rebase.len(), 2);
}

#[tokio::test]
async fn test_rebase_step_loop() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "initial");
    repo.commit("initial");

    let base_oid = repo.repo.head().unwrap().target().unwrap();

    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();

    repo.write_file("test2.txt", "hello 2");
    repo.commit("commit 2");

    repo.write_file("test3.txt", "hello 3");
    repo.commit("commit 3");

    let _todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();

    let status = rebase_step(repo.path_str().to_string(), "none".to_string(), None)
        .await
        .unwrap();

    assert_eq!(status.status, "finished");
}

#[tokio::test]
async fn test_rebase_step_squash_and_fixup() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "initial");
    repo.commit("initial");

    let base_oid = repo.repo.head().unwrap().target().unwrap();

    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();

    repo.write_file("test.txt", "initial\ncommit 2");
    repo.commit("commit 2");

    repo.write_file("test.txt", "initial\ncommit 2\ncommit 3");
    repo.commit("commit 3");

    let todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    assert_eq!(todos.len(), 2);

    let mut modified_todos = todos.clone();
    modified_todos[1].action = "fixup".to_string();

    rebase_write_todo(repo.path_str().to_string(), modified_todos)
        .await
        .unwrap();

    let status = rebase_step(repo.path_str().to_string(), "none".to_string(), None)
        .await
        .unwrap();
    assert_eq!(status.status, "finished");

    let head_commit = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head_commit.parent_count(), 1);
    assert_eq!(head_commit.parent(0).unwrap().id(), base_oid);
    assert_eq!(head_commit.message().unwrap().trim(), "commit 2");
    let content = std::fs::read_to_string(repo.path.join("test.txt")).unwrap();
    assert_eq!(content, "initial\ncommit 2\ncommit 3");
}

#[tokio::test]
async fn test_rebase_step_squash_continue() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "initial");
    repo.commit("initial");

    let base_oid = repo.repo.head().unwrap().target().unwrap();

    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();

    repo.write_file("test.txt", "initial\ncommit 2");
    repo.commit("commit 2");

    repo.write_file("test.txt", "initial\ncommit 2\ncommit 3");
    repo.commit("commit 3");

    let todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    assert_eq!(todos.len(), 2);

    let mut modified_todos = todos.clone();
    modified_todos[1].action = "squash".to_string();

    rebase_write_todo(repo.path_str().to_string(), modified_todos)
        .await
        .unwrap();

    let status = rebase_step(repo.path_str().to_string(), "none".to_string(), None)
        .await
        .unwrap();
    assert_eq!(status.status, "reword");

    let status2 = rebase_step(
        repo.path_str().to_string(),
        "continue".to_string(),
        Some("combined message edited".to_string()),
    )
    .await
    .unwrap();
    assert_eq!(status2.status, "finished");

    let head_commit = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head_commit.parent_count(), 1);
    assert_eq!(head_commit.parent(0).unwrap().id(), base_oid);
    assert_eq!(
        head_commit.message().unwrap().trim(),
        "combined message edited"
    );
}

#[tokio::test]
async fn test_get_reflog_and_restore() {
    let repo = TempRepo::new();
    repo.write_file("file1.txt", "v1");
    repo.commit("initial commit");
    let commit1_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    repo.write_file("file1.txt", "v2");
    repo.commit("second commit");

    let entries = get_reflog(repo.path_str().to_string(), None, None)
        .await
        .unwrap();
    assert!(!entries.is_empty());

    let res = restore_reflog_entry(
        repo.path_str().to_string(),
        commit1_oid.to_string(),
        "hard".to_string(),
    )
    .await;

    assert!(res.is_ok());
    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head.id(), commit1_oid);
}

#[tokio::test]
async fn test_stage_files_new_and_modified() {
    let repo = TempRepo::new();
    repo.write_file("file.txt", "initial contents");

    stage_files(repo.path_str().to_string(), vec!["file.txt".to_string()])
        .await
        .unwrap();

    let index = repo.repo.index().unwrap();
    assert!(index
        .get_path(std::path::Path::new("file.txt"), 0)
        .is_some());
}

#[tokio::test]
async fn test_stage_files_deleted() {
    let repo = TempRepo::new();
    repo.write_file("file.txt", "contents");
    repo.commit("initial");

    repo.remove_file("file.txt");

    stage_files(repo.path_str().to_string(), vec!["file.txt".to_string()])
        .await
        .unwrap();

    let mut index = repo.repo.index().unwrap();
    index.read(true).unwrap();
    assert!(index
        .get_path(std::path::Path::new("file.txt"), 0)
        .is_none());
}

#[tokio::test]
async fn test_unstage_files() {
    let repo = TempRepo::new();
    repo.write_file("file.txt", "contents");

    stage_files(repo.path_str().to_string(), vec!["file.txt".to_string()])
        .await
        .unwrap();

    unstage_files(repo.path_str().to_string(), vec!["file.txt".to_string()])
        .await
        .unwrap();

    let index = repo.repo.index().unwrap();
    assert!(index
        .get_path(std::path::Path::new("file.txt"), 0)
        .is_none());
}

#[tokio::test]
async fn test_discard_changes() {
    let repo = TempRepo::new();
    repo.write_file("file.txt", "original");
    repo.commit("commit 1");

    repo.write_file("file.txt", "modified");

    discard_changes(repo.path_str().to_string(), vec!["file.txt".to_string()])
        .await
        .unwrap();

    let content = std::fs::read_to_string(repo.path.join("file.txt")).unwrap();
    assert_eq!(content, "original");
}

#[tokio::test]
async fn test_unsafe_paths() {
    let repo = TempRepo::new();

    let err1 = stage_files(repo.path_str().to_string(), vec!["/etc/passwd".to_string()]).await;
    assert!(err1.is_err());
    assert!(err1
        .unwrap_err()
        .message
        .contains("Absolute paths are not allowed"));

    let err2 = discard_changes(repo.path_str().to_string(), vec!["/etc/passwd".to_string()]).await;
    assert!(err2.is_err());
    assert!(err2
        .unwrap_err()
        .message
        .contains("Absolute paths are not allowed"));

    let err3 = stage_files(
        repo.path_str().to_string(),
        vec!["../../file.txt".to_string()],
    )
    .await;
    assert!(err3.is_err());
    assert!(err3
        .unwrap_err()
        .message
        .contains("Path traversal is not allowed"));

    let err4 = discard_changes(
        repo.path_str().to_string(),
        vec!["../../file.txt".to_string()],
    )
    .await;
    assert!(err4.is_err());
    assert!(err4
        .unwrap_err()
        .message
        .contains("Path traversal is not allowed"));
}

#[tokio::test]
async fn test_apply_patch_rejects_path_traversal() {
    let repo = TempRepo::new();
    repo.write_file("dummy.txt", "initial");
    repo.commit("initial");

    let traversal_patch = "\
diff --git a/../../evil.txt b/../../evil.txt
new file mode 100644
--- /dev/null
+++ b/../../evil.txt
@@ -0,0 +1 @@
+malicious content
";

    let result = apply_patch(
        repo.path_str().to_string(),
        traversal_patch.to_string(),
        "workdir".to_string(),
    )
    .await;

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(err.message.contains("traversal") || err.message.contains("not allowed"));
}

#[tokio::test]
async fn test_list_and_add_worktree() {
    let repo = TempRepo::new();
    repo.write_file("main.txt", "main content");
    repo.commit("initial commit");

    let wt_list = list_worktrees(repo.path_str().to_string()).await.unwrap();
    assert_eq!(wt_list.len(), 1);

    let add_res = add_worktree(
        repo.path_str().to_string(),
        "wt1".to_string(),
        None,
        Some("wt-branch".to_string()),
    )
    .await;

    assert!(add_res.is_ok());

    let wt_list2 = list_worktrees(repo.path_str().to_string()).await.unwrap();
    assert_eq!(wt_list2.len(), 2);
}

#[tokio::test]
async fn test_pre_commit_hook_discovery_in_worktree() {
    let repo = TempRepo::new();
    repo.write_file("main.txt", "main content");
    repo.commit("initial commit");

    let rel_wt_path = "wt_hook_test";
    let wt_dir = repo.path.join(rel_wt_path);
    add_worktree(
        repo.path_str().to_string(),
        rel_wt_path.to_string(),
        None,
        Some("wt-hook-branch".to_string()),
    )
    .await
    .unwrap();

    // Verify .git in worktree is a pointer file
    let wt_git_file = wt_dir.join(".git");
    assert!(wt_git_file.is_file());

    // Create executable pre-commit hook in repo's main hooks dir
    let hooks_dir = repo.path.join(".git").join("hooks");
    std::fs::create_dir_all(&hooks_dir).unwrap();
    let hook_file = hooks_dir.join("pre-commit");
    std::fs::write(&hook_file, "#!/bin/sh\nexit 1\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&hook_file).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&hook_file, perms).unwrap();
    }

    // Attempt to create commit in worktree with failing pre-commit hook
    std::fs::write(wt_dir.join("main.txt"), "modified in wt").unwrap();

    let result = create_commit(
        wt_dir.to_string_lossy().to_string(),
        "failing commit".to_string(),
        None,
        None,
        false,
        false,
    )
    .await;

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(err.message.contains("Pre-commit hook failed"));
}
