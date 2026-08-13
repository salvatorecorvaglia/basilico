/* ═══════════════════════════════════════════════════════
Basilico — Backend Integration Tests
Tests for Git operations, reflog, patch generation, and worktree controls
═══════════════════════════════════════════════════════ */

use basilico_lib::test_utils::TempRepo;

#[tokio::test]
async fn test_integration_repo_lifecycle() {
    let repo = TempRepo::new();
    repo.write_file("readme.md", "# Integration Test Repo\n");
    repo.commit("initial commit");

    let head_commit = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head_commit.summary().ok().flatten().unwrap(), "initial commit");
}

#[tokio::test]
async fn test_integration_reflog_history() {
    let repo = TempRepo::new();
    repo.write_file("file1.txt", "content v1");
    repo.commit("commit 1");

    repo.write_file("file1.txt", "content v2");
    repo.commit("commit 2");

    let reflog = repo.repo.reflog("HEAD").unwrap();
    assert!(reflog.len() >= 2);
}

#[tokio::test]
async fn test_integration_worktree_and_patch() {
    let repo = TempRepo::new();
    repo.write_file("patch.txt", "hello world\n");
    repo.commit("add patch file");

    let head_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    // Verify git format-patch command succeeds
    let output = std::process::Command::new("git")
        .args(["format-patch", "-1", "--stdout", &head_oid.to_string()])
        .current_dir(&repo.path)
        .output()
        .unwrap();

    assert!(output.status.success());
    let patch_str = String::from_utf8_lossy(&output.stdout);
    assert!(patch_str.contains("add patch file"));
}
