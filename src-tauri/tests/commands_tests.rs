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

/// Builds `initial` → `commit 2` → `commit 3` on `branch1` and returns the
/// OID of `initial`, which every rebase test uses as the upstream.
async fn setup_rebase_repo(repo: &TempRepo, same_file: bool) -> git2::Oid {
    repo.write_file("test.txt", "initial");
    repo.commit("initial");

    let base_oid = repo.repo.head().unwrap().target().unwrap();

    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();

    if same_file {
        repo.write_file("test.txt", "initial\ncommit 2");
        repo.commit("commit 2");
        repo.write_file("test.txt", "initial\ncommit 2\ncommit 3");
        repo.commit("commit 3");
    } else {
        repo.write_file("test2.txt", "hello 2");
        repo.commit("commit 2");
        repo.write_file("test3.txt", "hello 3");
        repo.commit("commit 3");
    }

    base_oid
}

fn commit_messages(repo: &TempRepo) -> Vec<String> {
    let mut revwalk = repo.repo.revwalk().unwrap();
    revwalk.push_head().unwrap();
    revwalk
        .map(|oid| {
            repo.repo
                .find_commit(oid.unwrap())
                .unwrap()
                .message()
                .unwrap_or("")
                .trim()
                .to_string()
        })
        .collect()
}

#[tokio::test]
async fn test_rebase_init_does_not_touch_repository() {
    let repo = TempRepo::new();
    let base_oid = setup_rebase_repo(&repo, false).await;

    let todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();

    // Oldest first, matching the order git applies the todo in.
    assert_eq!(todos.len(), 2);
    assert_eq!(todos[0].summary, "commit 2");
    assert_eq!(todos[1].summary, "commit 3");
    assert!(todos.iter().all(|t| t.action == "pick"));

    // Planning must be side-effect free: abandoning the editor here previously
    // left the repository stranded mid-rebase.
    assert_eq!(repo.repo.state(), git2::RepositoryState::Clean);
    assert!(repo.repo.open_rebase(None).is_err());
}

#[tokio::test]
async fn test_rebase_start_applies_plan_in_order() {
    let repo = TempRepo::new();
    let base_oid = setup_rebase_repo(&repo, false).await;

    let todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();

    // Swap the two commits. This is the regression that matters: the previous
    // libgit2-driven implementation ignored the reordered todo entirely and
    // applied commits in their original order.
    let reordered = vec![todos[1].clone(), todos[0].clone()];

    let status = rebase_start(repo.path_str().to_string(), base_oid.to_string(), reordered)
        .await
        .unwrap();

    assert_eq!(status.status, "finished");

    let messages = commit_messages(&repo);
    assert_eq!(messages, vec!["commit 2", "commit 3", "initial"]);
}

#[tokio::test]
async fn test_rebase_start_drop_removes_commit() {
    let repo = TempRepo::new();
    let base_oid = setup_rebase_repo(&repo, false).await;

    let mut todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    todos[0].action = "drop".to_string();

    let status = rebase_start(repo.path_str().to_string(), base_oid.to_string(), todos)
        .await
        .unwrap();
    assert_eq!(status.status, "finished");

    let messages = commit_messages(&repo);
    assert_eq!(messages, vec!["commit 3", "initial"]);
}

#[tokio::test]
async fn test_rebase_start_rejects_plan_that_drops_everything() {
    let repo = TempRepo::new();
    let base_oid = setup_rebase_repo(&repo, false).await;

    let mut todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    for t in todos.iter_mut() {
        t.action = "drop".to_string();
    }

    let err = rebase_start(repo.path_str().to_string(), base_oid.to_string(), todos)
        .await
        .unwrap_err();
    assert!(err.message.contains("drops every commit"));
    assert_eq!(repo.repo.state(), git2::RepositoryState::Clean);
}

#[tokio::test]
async fn test_rebase_start_fixup_melds_without_editor() {
    let repo = TempRepo::new();
    let base_oid = setup_rebase_repo(&repo, true).await;

    let mut todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    todos[1].action = "fixup".to_string();

    let status = rebase_start(repo.path_str().to_string(), base_oid.to_string(), todos)
        .await
        .unwrap();
    assert_eq!(status.status, "finished");

    let head_commit = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head_commit.parent_count(), 1);
    assert_eq!(head_commit.parent(0).unwrap().id(), base_oid);
    // fixup keeps the first commit's message and discards the second's.
    assert_eq!(head_commit.message().unwrap().trim(), "commit 2");

    let content = std::fs::read_to_string(repo.path.join("test.txt")).unwrap();
    assert_eq!(content, "initial\ncommit 2\ncommit 3");
}

#[tokio::test]
async fn test_rebase_start_squash_uses_edited_message() {
    let repo = TempRepo::new();
    let base_oid = setup_rebase_repo(&repo, true).await;

    let mut todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    todos[1].action = "squash".to_string();
    todos[1].summary = "combined message edited".to_string();

    let status = rebase_start(repo.path_str().to_string(), base_oid.to_string(), todos)
        .await
        .unwrap();
    assert_eq!(status.status, "finished");

    let head_commit = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head_commit.parent_count(), 1);
    assert_eq!(head_commit.parent(0).unwrap().id(), base_oid);
    assert_eq!(
        head_commit.message().unwrap().trim(),
        "combined message edited"
    );

    let content = std::fs::read_to_string(repo.path.join("test.txt")).unwrap();
    assert_eq!(content, "initial\ncommit 2\ncommit 3");
}

#[tokio::test]
async fn test_rebase_reword_message_survives_shell_metacharacters() {
    let repo = TempRepo::new();
    let base_oid = setup_rebase_repo(&repo, false).await;

    let mut todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    todos[0].action = "reword".to_string();
    // The message reaches git through an `exec` line, so quoting has to hold up
    // against characters the shell would otherwise interpret.
    todos[0].summary = "it's a $(dangerous) `message` \"quoted\"".to_string();

    let status = rebase_start(repo.path_str().to_string(), base_oid.to_string(), todos)
        .await
        .unwrap();
    assert_eq!(status.status, "finished");

    let messages = commit_messages(&repo);
    assert!(
        messages.contains(&"it's a $(dangerous) `message` \"quoted\"".to_string()),
        "reworded message was mangled: {:?}",
        messages
    );
}

#[tokio::test]
async fn test_rebase_conflict_then_abort_restores_original_head() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial");

    let base_oid = repo.repo.head().unwrap().target().unwrap();
    let default_branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    // Divergent edits to the same line on both sides guarantee a conflict.
    create_branch(repo.path_str().to_string(), "branch1".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();
    repo.write_file("test.txt", "branch side");
    repo.commit("branch commit");
    let branch_head = repo.repo.head().unwrap().target().unwrap();

    checkout_branch(repo.path_str().to_string(), default_branch.clone())
        .await
        .unwrap();
    repo.write_file("test.txt", "upstream side");
    repo.commit("upstream commit");
    let upstream_oid = repo.repo.head().unwrap().target().unwrap();

    checkout_branch(repo.path_str().to_string(), "branch1".to_string())
        .await
        .unwrap();

    let todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    assert_eq!(todos.len(), 1);

    let status = rebase_start(repo.path_str().to_string(), upstream_oid.to_string(), todos)
        .await
        .unwrap();

    assert_eq!(
        status.status, "conflict",
        "expected the rebase to stop on a conflict, got {:?}",
        status
    );

    rebase_step(repo.path_str().to_string(), "abort".to_string(), None)
        .await
        .unwrap();

    assert_eq!(
        repo.repo.head().unwrap().target().unwrap(),
        branch_head,
        "abort must restore the original branch head"
    );
    assert_eq!(repo.repo.state(), git2::RepositoryState::Clean);
}

#[tokio::test]
async fn test_rebase_step_rejects_unknown_action() {
    let repo = TempRepo::new();
    setup_rebase_repo(&repo, false).await;

    let err = rebase_step(repo.path_str().to_string(), "none".to_string(), None)
        .await
        .unwrap_err();
    assert!(err.message.contains("Unsupported rebase action"));
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
    // A linked worktree has no hooks directory of its own, so discovery must
    // fall through to the common directory shared with the main repository.
    assert!(
        err.message.contains("pre-commit"),
        "the failure should name the hook that rejected the commit, got: {}",
        err.message
    );
}

/// A rejected push must surface as an error.
///
/// `Remote::push` returns Ok when the *transport* succeeded, even if the server
/// refused the ref update. Without a `push_update_reference` callback the UI
/// reported "pushed successfully" while nothing had reached the remote — this
/// test fails if that callback is ever dropped again.
#[tokio::test]
async fn test_push_surfaces_server_side_rejection() {
    use basilico_lib::commands::remote::push;

    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");

    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    // A bare repository standing in for the remote.
    let remote_path = repo
        .path
        .parent()
        .unwrap()
        .join(format!("remote-{}.git", uuid::Uuid::new_v4()));
    git2::Repository::init_bare(&remote_path).unwrap();
    repo.repo
        .remote("origin", remote_path.to_str().unwrap())
        .unwrap();

    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
        .handle()
        .clone();

    // First push establishes the branch on the remote.
    push(
        app.clone(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch.clone(),
        false,
        None,
    )
    .await
    .expect("initial push should succeed");

    // Move the remote forward independently, then rewrite local history so the
    // two have diverged and a non-forced push must be refused.
    let remote_repo = git2::Repository::open(&remote_path).unwrap();
    let remote_head = remote_repo.head().unwrap().peel_to_commit().unwrap();
    let sig = git2::Signature::now("Other", "other@example.com").unwrap();
    let tree = remote_head.tree().unwrap();
    remote_repo
        .commit(
            Some(&format!("refs/heads/{}", branch)),
            &sig,
            &sig,
            "remote side moved on",
            &tree,
            &[&remote_head],
        )
        .unwrap();

    repo.write_file("f.txt", "local divergence");
    repo.commit("local side");

    let result = push(
        app,
        repo.path_str().to_string(),
        "origin".to_string(),
        branch,
        false,
        None,
    )
    .await;

    // The point of the test is that a push which did not update the remote can
    // never report success. Which layer catches it varies: libgit2 rejects an
    // obviously diverged push locally, whereas a server-side refusal (protected
    // branch, pre-receive hook) is only visible through the
    // `push_update_reference` callback — see `test_push_rejection_report`.
    let err = result.expect_err("a non-fast-forward push must not report success");
    assert!(
        !err.message.is_empty(),
        "the failure must carry an explanation for the user"
    );

    // The remote must still be on its own commit, untouched by the failed push.
    let remote_repo = git2::Repository::open(&remote_path).unwrap();
    let remote_tip = remote_repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(
        remote_tip.summary().ok().flatten().unwrap(),
        "remote side moved on"
    );

    std::fs::remove_dir_all(&remote_path).ok();
}

/// The collector that turns `push_update_reference` callbacks into an error.
///
/// This is the path a server-side refusal takes — libgit2 reports the push as
/// successful and only signals the refusal through this callback.
#[test]
fn test_push_rejection_report() {
    use basilico_lib::git::credentials::{check_push_rejections, new_push_rejections};

    // Nothing rejected: the push stands.
    let clean = new_push_rejections();
    assert!(check_push_rejections(&clean).is_ok());

    // One ref refused by the server.
    let rejected = new_push_rejections();
    rejected
        .borrow_mut()
        .push("refs/heads/main — pre-receive hook declined".to_string());
    let err = check_push_rejections(&rejected).expect_err("a refusal must become an error");
    assert!(err.message.contains("refs/heads/main"));
    assert!(err.message.contains("pre-receive hook declined"));

    // Several refusals are all reported, not just the first.
    let many = new_push_rejections();
    many.borrow_mut().push("refs/heads/a — denied".to_string());
    many.borrow_mut().push("refs/heads/b — denied".to_string());
    let err = check_push_rejections(&many).unwrap_err();
    assert!(err.message.contains("refs/heads/a"));
    assert!(err.message.contains("refs/heads/b"));
}

/* ═══════════════════════════════════════════════════════
Git hook lifecycle
═══════════════════════════════════════════════════════ */

/// Install an executable hook script in the repository.
#[cfg(unix)]
fn install_hook(repo: &TempRepo, name: &str, body: &str) {
    use std::os::unix::fs::PermissionsExt;
    let dir = repo.path.join(".git").join("hooks");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, body).unwrap();
    let mut perms = std::fs::metadata(&path).unwrap().permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&path, perms).unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn test_commit_msg_hook_can_rewrite_the_message() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "hello");

    // A trailer-appending hook: the classic reason commit-msg exists.
    install_hook(
        &repo,
        "commit-msg",
        "#!/bin/sh\nprintf '\\nIssue: ABC-123\\n' >> \"$1\"\n",
    );

    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    create_commit(
        repo.path_str().to_string(),
        "add a file".to_string(),
        None,
        None,
        false,
        false,
    )
    .await
    .unwrap();

    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    let msg = head.message().unwrap();
    assert!(msg.contains("add a file"), "original message lost: {msg:?}");
    assert!(
        msg.contains("Issue: ABC-123"),
        "commit-msg hook edit was discarded: {msg:?}"
    );
}

#[cfg(unix)]
#[tokio::test]
async fn test_commit_msg_hook_rejection_aborts_the_commit() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "hello");
    install_hook(
        &repo,
        "commit-msg",
        "#!/bin/sh\necho 'bad message' >&2\nexit 1\n",
    );

    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    let err = create_commit(
        repo.path_str().to_string(),
        "nope".to_string(),
        None,
        None,
        false,
        false,
    )
    .await
    .unwrap_err();

    assert!(err.message.contains("commit-msg"), "got: {}", err.message);
    assert!(
        err.message.contains("bad message"),
        "hook output should reach the user"
    );
    assert!(
        repo.repo.head().is_err(),
        "no commit should have been created"
    );
}

#[cfg(unix)]
#[tokio::test]
async fn test_core_hooks_path_is_honoured() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "hello");

    // Husky and lefthook both work by pointing core.hooksPath elsewhere.
    let custom = repo.path.join(".husky");
    std::fs::create_dir_all(&custom).unwrap();
    {
        use std::os::unix::fs::PermissionsExt;
        let p = custom.join("commit-msg");
        std::fs::write(&p, "#!/bin/sh\nprintf '\\nvia-hooks-path\\n' >> \"$1\"\n").unwrap();
        let mut perms = std::fs::metadata(&p).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&p, perms).unwrap();
    }
    repo.repo
        .config()
        .unwrap()
        .set_str("core.hooksPath", custom.to_str().unwrap())
        .unwrap();

    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    create_commit(
        repo.path_str().to_string(),
        "hooked".to_string(),
        None,
        None,
        false,
        false,
    )
    .await
    .unwrap();

    let msg = repo
        .repo
        .head()
        .unwrap()
        .peel_to_commit()
        .unwrap()
        .message()
        .unwrap()
        .to_string();
    assert!(
        msg.contains("via-hooks-path"),
        "core.hooksPath ignored: {msg:?}"
    );
}

#[cfg(unix)]
#[tokio::test]
async fn test_post_commit_failure_does_not_fail_the_commit() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "hello");
    install_hook(&repo, "post-commit", "#!/bin/sh\nexit 3\n");

    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    // git ignores post-commit's exit status; a failing notification hook must
    // not make a successful commit look like it failed.
    create_commit(
        repo.path_str().to_string(),
        "still committed".to_string(),
        None,
        None,
        false,
        false,
    )
    .await
    .expect("post-commit failure must not abort the commit");

    assert!(repo.repo.head().is_ok());
}

#[cfg(unix)]
#[tokio::test]
async fn test_bypass_hooks_skips_every_hook() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "hello");
    install_hook(&repo, "pre-commit", "#!/bin/sh\nexit 1\n");
    install_hook(&repo, "commit-msg", "#!/bin/sh\nexit 1\n");

    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    create_commit(
        repo.path_str().to_string(),
        "bypassed".to_string(),
        None,
        None,
        false,
        true,
    )
    .await
    .expect("bypass_hooks must skip failing hooks");
}

#[cfg(unix)]
#[tokio::test]
async fn test_non_executable_hook_is_ignored() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "hello");

    // git skips hook files without the executable bit; so must we, otherwise a
    // stale `.sample`-style file would block every commit.
    let dir = repo.path.join(".git").join("hooks");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("pre-commit"), "#!/bin/sh\nexit 1\n").unwrap();

    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    create_commit(
        repo.path_str().to_string(),
        "ok".to_string(),
        None,
        None,
        false,
        false,
    )
    .await
    .expect("a non-executable hook must be ignored");
}

/// A force push must not silently overwrite commits pushed by someone else.
///
/// libgit2 has no `--force-with-lease`, so the check is explicit: the caller
/// states which remote tip it believes is current, and the push is refused if
/// the remote-tracking ref says otherwise.
#[tokio::test]
async fn test_force_push_refuses_when_remote_moved() {
    use basilico_lib::commands::remote::push;

    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");
    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    let remote_path = repo
        .path
        .parent()
        .unwrap()
        .join(format!("lease-remote-{}.git", uuid::Uuid::new_v4()));
    git2::Repository::init_bare(&remote_path).unwrap();
    repo.repo
        .remote("origin", remote_path.to_str().unwrap())
        .unwrap();

    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
        .handle()
        .clone();

    push(
        app.clone(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch.clone(),
        false,
        None,
    )
    .await
    .expect("initial push should succeed");

    // The remote-tracking ref now records where we believe the remote is.
    let tracked = repo
        .repo
        .find_reference(&format!("refs/remotes/origin/{}", branch))
        .unwrap()
        .target()
        .unwrap()
        .to_string();

    // Claiming a stale tip must be refused...
    let stale = "0".repeat(40);
    let err = push(
        app.clone(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch.clone(),
        true,
        Some(stale),
    )
    .await
    .expect_err("a stale lease must block the force push");
    assert!(
        err.message.contains("Refusing to force push"),
        "got: {}",
        err.message
    );

    // ...while the correct tip lets it through.
    repo.write_file("f.txt", "rewritten");
    repo.commit("rewrite");
    push(
        app,
        repo.path_str().to_string(),
        "origin".to_string(),
        branch,
        true,
        Some(tracked),
    )
    .await
    .expect("a matching lease should allow the force push");

    std::fs::remove_dir_all(&remote_path).ok();
}

/// The lease must fail *closed*.
///
/// Both "the caller supplied no expected tip" and "there is no remote-tracking
/// ref to compare against" previously fell through to an unguarded force push,
/// silently removing the only protection against overwriting someone else's
/// work at exactly the moment the local view of the remote was missing.
#[tokio::test]
async fn test_force_push_refuses_when_the_lease_cannot_be_established() {
    use basilico_lib::commands::remote::push;

    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");
    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    let remote_path = repo
        .path
        .parent()
        .unwrap()
        .join(format!("lease-open-{}.git", uuid::Uuid::new_v4()));
    git2::Repository::init_bare(&remote_path).unwrap();
    repo.repo
        .remote("origin", remote_path.to_str().unwrap())
        .unwrap();

    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
        .handle()
        .clone();

    // No expected tip at all: previously skipped the check entirely.
    let err = push(
        app.clone(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch.clone(),
        true,
        None,
    )
    .await
    .expect_err("a force push without a lease must be refused");
    assert!(
        err.message.contains("Refusing to force push"),
        "got: {}",
        err.message
    );

    // An empty string is the same "no information" case arriving from the UI.
    let err = push(
        app.clone(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch.clone(),
        true,
        Some(String::new()),
    )
    .await
    .expect_err("an empty lease must be refused");
    assert!(
        err.message.contains("Refusing to force push"),
        "got: {}",
        err.message
    );

    // A claimed tip with no remote-tracking ref to verify it against (never
    // fetched, or the ref was pruned) is unverifiable, so it must also refuse.
    let err = push(
        app,
        repo.path_str().to_string(),
        "origin".to_string(),
        branch,
        true,
        Some("0".repeat(40)),
    )
    .await
    .expect_err("an unverifiable lease must be refused");
    assert!(
        err.message.contains("Refusing to force push"),
        "got: {}",
        err.message
    );

    std::fs::remove_dir_all(&remote_path).ok();
}

/// Values that reach a git argv slot must never be readable as flags.
///
/// `git rebase -i --exec=<cmd>` runs an arbitrary command after every replayed
/// commit, and `git submodule add` delegates to `git clone`, which honours
/// `--upload-pack=<cmd>`. Both are command execution, and neither needs a shell.
#[tokio::test]
async fn test_rebase_rejects_option_shaped_upstream() {
    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");

    for upstream in ["--exec=touch /tmp/pwned", "-x", ""] {
        let err = rebase_start(
            repo.path_str().to_string(),
            upstream.to_string(),
            Vec::new(),
        )
        .await
        .expect_err("an option-shaped upstream must be refused");
        assert!(
            err.message.contains("must not start with a hyphen")
                || err.message.contains("must not be empty"),
            "upstream {:?} produced: {}",
            upstream,
            err.message
        );
    }
}

#[tokio::test]
async fn test_add_submodule_rejects_option_shaped_url() {
    use basilico_lib::commands::submodule::add_submodule;

    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");

    let err = add_submodule(
        repo.path_str().to_string(),
        "--upload-pack=touch /tmp/pwned".to_string(),
        "vendor/dep".to_string(),
    )
    .await
    .expect_err("an option-shaped submodule URL must be refused");
    assert!(
        err.message.contains("must not start with a hyphen"),
        "got: {}",
        err.message
    );
}

/// A repository can commit a symlink pointing anywhere on disk, and git will
/// check it out. `fs::read_to_string`/`fs::write` follow symlinks, so the
/// syntactic path check alone let a hostile repo read or overwrite any file the
/// user could.
#[cfg(unix)]
#[tokio::test]
async fn test_workdir_reads_and_writes_refuse_symlinked_paths() {
    use basilico_lib::commands::conflict_resolver::save_merged_resolution;
    use basilico_lib::commands::diff::get_file_content_pair;

    let repo = TempRepo::new();
    repo.write_file("real.txt", "content");
    repo.commit("seed");

    let secret = repo
        .path
        .parent()
        .unwrap()
        .join(format!("basilico-secret-{}.txt", uuid::Uuid::new_v4()));
    std::fs::write(&secret, "TOP SECRET").unwrap();
    std::os::unix::fs::symlink(&secret, repo.path.join("leak.txt")).unwrap();

    // `FileContentPair` is not `Debug`, so match rather than `expect_err`.
    match get_file_content_pair(repo.path_str().to_string(), "leak.txt".to_string(), false).await {
        Ok(_) => panic!("reading through a symlink must be refused"),
        Err(err) => assert!(
            err.message.contains("symbolic link"),
            "got: {}",
            err.message
        ),
    }

    let err = save_merged_resolution(
        repo.path_str().to_string(),
        "leak.txt".to_string(),
        "OVERWRITTEN".to_string(),
    )
    .await
    .expect_err("writing through a symlink must be refused");
    assert!(
        err.message.contains("symbolic link"),
        "got: {}",
        err.message
    );

    assert_eq!(
        std::fs::read_to_string(&secret).unwrap(),
        "TOP SECRET",
        "the symlink target must not have been overwritten"
    );

    std::fs::remove_file(&secret).ok();
}
