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
use basilico_lib::commands::tag::*;
use basilico_lib::commands::worktree::*;
use basilico_lib::error::AppError;
use basilico_lib::git::helpers::MergeOutcome;
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
async fn test_delete_remote_branch_rejects_malformed_name() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    let path = repo.path_str().to_string();
    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
        .handle()
        .clone();

    // A remote-tracking branch name must be "remote/branch". Without a slash
    // there is no remote to push the deletion to; silently returning Ok would
    // make the caller believe the branch was deleted when nothing happened.
    let result = delete_branch(app, path, "no-slash-name".to_string(), true).await;
    assert!(result.is_err());
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

/// Only a real remote prefix makes a branch "the same" as a protected one:
/// `feature/main` is an ordinary topic branch and can be swept.
#[tokio::test]
async fn test_list_merged_branches_offers_topic_branch_named_like_main() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");

    let path = repo.path_str().to_string();
    create_branch(path.clone(), "feature/main".to_string(), None)
        .await
        .unwrap();
    repo.write_file("test.txt", "hello world");
    repo.commit("second commit");

    let merged = list_merged_branches(path, None).await.unwrap();
    let names: Vec<_> = merged.iter().map(|b| b.name.as_str()).collect();
    assert_eq!(names, vec!["feature/main"]);
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

    let entries = get_commit_tree(repo.path_str().to_string(), head_oid.to_string(), None)
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

#[test]
fn test_parse_gpg_status_output_goodsig() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let output = "[GNUPG:] NEWSIG\n\
                   [GNUPG:] GOODSIG ABCDEF1234567890 Jane Doe <jane@example.com>\n\
                   [GNUPG:] VALIDSIG ...\n\
                   [GNUPG:] TRUST_ULTIMATE 0 pgp\n";
    let (status, key_id, signer) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "Verified");
    assert_eq!(key_id, "ABCDEF1234567890");
    assert_eq!(signer, "Jane Doe <jane@example.com>");
}

/// GOODSIG means the signature checks out against *some* key in the keyring,
/// not that the key is trusted. Anyone who can get a key into the user's
/// keyring could otherwise earn a green "Verified" badge under a UID of their
/// own choosing.
#[test]
fn test_parse_gpg_status_output_good_but_untrusted_is_not_verified() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let output = "[GNUPG:] GOODSIG ABCDEF1234567890 Mallory <m@example.com>\n\
                   [GNUPG:] VALIDSIG ...\n\
                   [GNUPG:] TRUST_UNDEFINED 0 pgp\n";
    let (status, key_id, signer) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "UntrustedKey");
    assert_eq!(key_id, "ABCDEF1234567890");
    assert_eq!(signer, "Mallory <m@example.com>");
}

/// gpg always emits a TRUST_* line after a good signature, so its absence means
/// this is not output we understand well enough to call verified.
#[test]
fn test_parse_gpg_status_output_goodsig_without_trust_line_is_untrusted() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let output = "[GNUPG:] GOODSIG ABCDEF1234567890 Jane Doe <jane@example.com>\n\
                   [GNUPG:] VALIDSIG ...\n";
    let (status, _, _) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "UntrustedKey");
}

#[test]
fn test_parse_gpg_status_output_revoked_key() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let output = "[GNUPG:] REVKEYSIG 1234ABCD Jane Doe <jane@example.com>\n";
    let (status, key_id, signer) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "RevokedKey");
    assert_eq!(key_id, "1234ABCD");
    assert_eq!(signer, "Jane Doe <jane@example.com>");
}

/// A trailing EXPKEYSIG used to overwrite an already-resolved status because
/// the parser assigned as it went. Resolution now happens once, at the end.
#[test]
fn test_parse_gpg_status_output_expired_outranks_accompanying_goodsig() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let output = "[GNUPG:] GOODSIG 1234ABCD Jane Doe <jane@example.com>\n\
                   [GNUPG:] VALIDSIG ...\n\
                   [GNUPG:] TRUST_ULTIMATE 0 pgp\n\
                   [GNUPG:] EXPKEYSIG 1234ABCD Jane Doe <jane@example.com>\n";
    let (status, _, _) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "ExpiredKey");
}

#[test]
fn test_parse_gpg_status_output_badsig() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let output = "[GNUPG:] BADSIG 1234ABCD Some Signer <s@example.com>\n";
    let (status, key_id, signer) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "BadSignature");
    assert_eq!(key_id, "1234ABCD");
    // BADSIG never sets the signer; the fallback author name is kept.
    assert_eq!(signer, "Fallback Name");
}

#[test]
fn test_parse_gpg_status_output_no_pubkey() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let output = "[GNUPG:] ERRSIG DEADBEEF12345678 1 2 00 1700000000 9\n\
                   [GNUPG:] NO_PUBKEY DEADBEEF12345678\n";
    let (status, key_id, signer) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "UnknownKey");
    assert_eq!(key_id, "DEADBEEF12345678");
    assert_eq!(signer, "Fallback Name");
}

#[test]
fn test_parse_gpg_status_output_expired_key() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let output = "[GNUPG:] EXPKEYSIG 1234ABCD Jane Doe <jane@example.com>\n";
    let (status, key_id, signer) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "ExpiredKey");
    assert_eq!(key_id, "1234ABCD");
    assert_eq!(signer, "Jane Doe <jane@example.com>");
}

#[test]
fn test_parse_gpg_status_output_no_matching_lines_stays_unverified() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    let (status, key_id, signer) = parse_gpg_status_output("", "Fallback Name");

    assert_eq!(status, "Unverified");
    assert_eq!(key_id, "GPG Key");
    // Nothing overrode it, so the caller's supplied author name is used
    // as-is — this is what lets a missing gpg binary fail safe rather
    // than presenting an unverifiable signature as trusted.
    assert_eq!(signer, "Fallback Name");
}

#[test]
fn test_parse_gpg_status_output_goodsig_is_not_downgraded_by_a_later_errsig() {
    use basilico_lib::commands::gpg::parse_gpg_status_output;

    // A GOODSIG followed by an unrelated ERRSIG/NO_PUBKEY line (e.g. from a
    // second, untrusted signature block) must not downgrade an
    // already-resolved good signature back to "UnknownKey".
    let output = "[GNUPG:] GOODSIG ABCDEF1234567890 Jane Doe <jane@example.com>\n\
                   [GNUPG:] VALIDSIG ...\n\
                   [GNUPG:] TRUST_ULTIMATE 0 pgp\n\
                   [GNUPG:] NO_PUBKEY 00000000\n";
    let (status, key_id, signer) = parse_gpg_status_output(output, "Fallback Name");

    assert_eq!(status, "Verified");
    assert_eq!(key_id, "ABCDEF1234567890");
    assert_eq!(signer, "Jane Doe <jane@example.com>");
}

#[test]
fn test_user_settings_defaults_are_safe() {
    use basilico_lib::commands::settings::UserSettings;

    let defaults = UserSettings::default();
    assert_eq!(defaults.bypass_hooks, Some(false));
    assert_eq!(defaults.vim_mode_enabled, Some(false));
    // Must default to off: this makes an unauthenticated request to
    // api.github.com on every branch switch, and a desktop Git client
    // should render correctly offline unless the user opts in.
    assert_eq!(defaults.check_github_ci_status, Some(false));
    assert_eq!(defaults.github_pat, None);
    assert!(!defaults.keyboard_shortcuts.is_empty());
}

#[test]
fn test_user_settings_round_trips_through_json() {
    use basilico_lib::commands::settings::UserSettings;

    let original = UserSettings {
        github_pat: Some("ghp_test".to_string()),
        check_github_ci_status: Some(true),
        ..UserSettings::default()
    };

    let json = serde_json::to_string(&original).unwrap();
    let parsed: UserSettings = serde_json::from_str(&json).unwrap();

    // The token lives in the OS credential store: serializing settings —
    // to `settings.json`, or to the UI — must never include it.
    assert!(
        !json.contains("ghp_test"),
        "the GitHub token must never be serialized: {json}"
    );
    assert_eq!(parsed.github_pat, None);
    assert_eq!(
        parsed.check_github_ci_status,
        original.check_github_ci_status
    );
    assert_eq!(parsed.theme, original.theme);
}

/// A token in a `settings.json` written by an earlier version is still read,
/// so it can be migrated into the credential store.
#[test]
fn test_user_settings_still_reads_a_legacy_plaintext_token() {
    use basilico_lib::commands::settings::UserSettings;

    let legacy_json = r#"{
        "theme": "sage-green",
        "sshKeyPath": null,
        "gitAuthorName": null,
        "gitAuthorEmail": null,
        "keyboardShortcuts": {},
        "githubPat": "ghp_legacy"
    }"#;
    let parsed: UserSettings = serde_json::from_str(legacy_json).unwrap();
    assert_eq!(parsed.github_pat.as_deref(), Some("ghp_legacy"));
}

#[test]
fn test_github_token_is_stored_and_cleared_in_the_secret_store() {
    use basilico_lib::secrets;

    secrets::use_in_memory_store();
    secrets::set_github_pat("  ghp_secret  ").unwrap();
    assert_eq!(
        secrets::github_pat().unwrap().as_deref(),
        Some("ghp_secret")
    );

    // An empty token removes the stored one.
    secrets::set_github_pat("").unwrap();
    assert_eq!(secrets::github_pat().unwrap(), None);
}

/// The GitHub token is offered for HTTPS git auth to github.com only.
#[test]
fn test_github_token_is_only_offered_to_github_https_urls() {
    use basilico_lib::git::credentials::is_github_https_url;

    assert!(is_github_https_url("https://github.com/o/r.git"));
    assert!(is_github_https_url("https://user@GitHub.com/o/r"));

    assert!(!is_github_https_url("https://github.com.evil.com/o/r"));
    assert!(!is_github_https_url("https://gitlab.com/o/r"));
    assert!(!is_github_https_url("http://github.com/o/r"));
    assert!(!is_github_https_url("git@github.com:o/r.git"));
    assert!(!is_github_https_url("https://evil.com/github.com/o/r"));
}

/// A `settings.json` written before a field like `check_github_ci_status`
/// existed must still load — serde gives `Option<T>` fields an implicit
/// `None` default when absent, but this pins that behaviour so a future
/// field addition that accidentally breaks it (e.g. by making the field
/// required) is caught immediately instead of surfacing as "existing users
/// can't open Settings" after a release.
#[test]
fn test_user_settings_deserializes_a_settings_file_missing_newer_fields() {
    use basilico_lib::commands::settings::UserSettings;

    let legacy_json = r#"{
        "theme": "sage-green",
        "sshKeyPath": null,
        "gitAuthorName": null,
        "gitAuthorEmail": null,
        "keyboardShortcuts": {}
    }"#;

    let parsed: UserSettings = serde_json::from_str(legacy_json).unwrap();
    assert_eq!(parsed.theme, "sage-green");
    assert_eq!(parsed.check_github_ci_status, None);
    assert_eq!(parsed.vim_mode_enabled, None);
    assert_eq!(parsed.github_pat, None);
}

/// `settings.json` holds the GitHub PAT, so it must never be created with
/// the default (world-readable) umask permissions.
#[cfg(unix)]
#[test]
fn test_write_private_file_sets_0600_permissions() {
    use basilico_lib::commands::settings::write_private_file;
    use std::os::unix::fs::PermissionsExt;

    let path = std::env::temp_dir().join(format!(
        "basilico-settings-test-{}.json",
        uuid::Uuid::new_v4()
    ));
    write_private_file(&path, r#"{"secret":"value"}"#).unwrap();

    let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600, "got mode {:o}", mode);

    // Reopening an existing file must tighten its permissions too, in case
    // it was written by an earlier version before this mode was enforced.
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    write_private_file(&path, r#"{"secret":"value2"}"#).unwrap();
    let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600, "got mode {:o}", mode);

    std::fs::remove_file(&path).ok();
}

/// The settings file is replaced atomically: the new content lands in full,
/// and no temporary file is left behind next to it.
#[test]
fn test_write_private_file_replaces_atomically_without_leftovers() {
    use basilico_lib::commands::settings::write_private_file;

    let dir = std::env::temp_dir().join(format!("basilico-atomic-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("settings.json");

    write_private_file(&path, "first").unwrap();
    write_private_file(&path, "second").unwrap();

    assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
    let entries: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(entries, vec!["settings.json".to_string()]);

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn test_get_repo_health() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "content");
    repo.commit("initial commit");

    let report = get_repo_health(repo.path_str().to_string()).await.unwrap();

    assert!(report.total_size_bytes > 0);
    assert!(report.git_size_bytes > 0);
    assert!(!report.has_commit_graph);

    basilico_lib::commands::run_git_cmd(&["commit-graph", "write", "--reachable"], repo.path_str())
        .unwrap();
    let report = get_repo_health(repo.path_str().to_string()).await.unwrap();
    assert!(report.has_commit_graph);
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
    assert_eq!(result, MergeOutcome::Success);

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
    assert_eq!(result, MergeOutcome::Success);

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
    assert_eq!(result, MergeOutcome::Conflicts);

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

    assert_eq!(status.status, RebasePhase::Finished);

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
    assert_eq!(status.status, RebasePhase::Finished);

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
    assert_eq!(status.status, RebasePhase::Finished);

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
    assert_eq!(status.status, RebasePhase::Finished);

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
    assert_eq!(status.status, RebasePhase::Finished);

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
        status.status,
        RebasePhase::Conflict,
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
    // The app opens a worktree in its own tab before acting on it.
    basilico_lib::state::register_open_repo(&wt_dir.to_string_lossy());

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

    // A symlink is diffed as git records it — its target path — and never
    // followed: the secret's content must not come back.
    // `FileContentPair` is not `Debug`, so match rather than `expect`.
    match get_file_content_pair(
        repo.path_str().to_string(),
        "leak.txt".to_string(),
        false,
        None,
    )
    .await
    {
        Ok(pair) => {
            assert!(
                !pair.modified.contains("TOP SECRET"),
                "the symlink was followed and its target's content leaked"
            );
            assert_eq!(pair.modified, secret.to_string_lossy());
        }
        Err(err) => panic!("diffing a symlink should show its target: {}", err.message),
    }

    // A symlinked *parent* still redirects outside the repository, so reading
    // through one stays refused.
    let outside_dir = repo
        .path
        .parent()
        .unwrap()
        .join(format!("basilico-outside-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&outside_dir).unwrap();
    std::fs::write(outside_dir.join("secret.txt"), "TOP SECRET").unwrap();
    std::os::unix::fs::symlink(&outside_dir, repo.path.join("linkdir")).unwrap();
    match get_file_content_pair(
        repo.path_str().to_string(),
        "linkdir/secret.txt".to_string(),
        false,
        None,
    )
    .await
    {
        Ok(_) => panic!("reading through a symlinked directory must be refused"),
        Err(err) => assert!(
            err.message.contains("symbolic link"),
            "got: {}",
            err.message
        ),
    }
    std::fs::remove_dir_all(&outside_dir).ok();

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

/// Stash indices shift on every push/pop/drop. A UI that captured index 1 for
/// a stash, then let something else (a CLI stash, a watcher-triggered
/// refresh) drop an earlier entry, must still land on the right stash by OID
/// rather than silently acting on whatever ended up at that stale index.
#[tokio::test]
async fn test_drop_stash_resolves_shifted_index_by_oid() {
    use basilico_lib::commands::stash::{drop_stash, list_stashes, save_stash};

    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial commit");
    let path = repo.path_str().to_string();

    repo.write_file("test.txt", "change one");
    save_stash(path.clone(), "first".to_string(), false)
        .await
        .unwrap();

    repo.write_file("test.txt", "change two");
    save_stash(path.clone(), "second".to_string(), false)
        .await
        .unwrap();

    // git formats the stash commit message as "On <branch>: <message>", so
    // match on substring rather than the raw message the caller supplied.
    let stashes = list_stashes(path.clone()).await.unwrap();
    assert_eq!(stashes.len(), 2);
    let first_entry = stashes
        .iter()
        .find(|s| s.message.contains("first"))
        .expect("the 'first' stash should still be present");
    let first_oid = first_entry.oid.clone();
    assert_eq!(
        first_entry.index, 1,
        "'first' should currently be the older, index-1 stash"
    );

    // Drop the newest stash directly by its current index — this is the
    // "something else changed the list" step. "first" now shifts to index 0.
    drop_stash(path.clone(), 0, None).await.unwrap();

    // The caller still believes "first" is at index 1 (its OID, captured
    // before the shift, is what makes this resolvable).
    drop_stash(path.clone(), 1, Some(first_oid))
        .await
        .expect("a stale index must still resolve correctly via OID");

    let remaining = list_stashes(path).await.unwrap();
    assert!(
        remaining.is_empty(),
        "both stashes should be gone, got: {:?}",
        remaining
    );
}

/// If the stash a caller is targeting has already been removed by the time
/// the action runs, resolution must fail loudly rather than silently acting
/// on whatever now occupies that index.
#[tokio::test]
async fn test_apply_stash_errors_when_stash_no_longer_exists() {
    use basilico_lib::commands::stash::{apply_stash, drop_stash, list_stashes, save_stash};

    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial commit");
    let path = repo.path_str().to_string();

    repo.write_file("test.txt", "change");
    save_stash(path.clone(), "only".to_string(), false)
        .await
        .unwrap();
    let oid = list_stashes(path.clone()).await.unwrap()[0].oid.clone();

    drop_stash(path.clone(), 0, None).await.unwrap();

    let err = apply_stash(path, 0, Some(oid))
        .await
        .expect_err("applying a dropped stash must fail");
    assert!(
        err.message.contains("no longer exists"),
        "got: {}",
        err.message
    );
}

/// The common case — the index the caller supplies still matches the OID it
/// was captured with — must keep working via the fast path.
#[tokio::test]
async fn test_pop_stash_succeeds_when_index_still_matches_oid() {
    use basilico_lib::commands::stash::{list_stashes, pop_stash, save_stash};

    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial commit");
    let path = repo.path_str().to_string();

    repo.write_file("test.txt", "change");
    save_stash(path.clone(), "only".to_string(), false)
        .await
        .unwrap();
    let oid = list_stashes(path.clone()).await.unwrap()[0].oid.clone();

    pop_stash(path.clone(), 0, Some(oid)).await.unwrap();

    assert!(list_stashes(path.clone()).await.unwrap().is_empty());
    assert_eq!(
        std::fs::read_to_string(repo.path.join("test.txt")).unwrap(),
        "change"
    );
}

#[tokio::test]
async fn test_create_lightweight_tag_and_list() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");
    let path = repo.path_str().to_string();
    let head_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    create_tag(
        path.clone(),
        "v1.0.0".to_string(),
        head_oid.to_string(),
        None,
        false,
    )
    .await
    .unwrap();

    let tags = list_tags(path).await.unwrap();
    let tag = tags.iter().find(|t| t.name == "v1.0.0").unwrap();
    assert!(!tag.is_annotated);
    assert_eq!(tag.oid, head_oid.to_string());
    assert!(tag.message.is_none());
    assert!(tag.tagger.is_none());
}

#[tokio::test]
async fn test_create_annotated_tag_and_list() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");
    let path = repo.path_str().to_string();
    let head_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    create_tag(
        path.clone(),
        "v2.0.0".to_string(),
        head_oid.to_string(),
        Some("Release 2.0.0".to_string()),
        false,
    )
    .await
    .unwrap();

    let tags = list_tags(path).await.unwrap();
    let tag = tags.iter().find(|t| t.name == "v2.0.0").unwrap();
    assert!(tag.is_annotated);
    assert_eq!(tag.message.as_deref(), Some("Release 2.0.0"));
    assert!(tag.tagger.as_deref().unwrap().contains("Test User"));
}

#[tokio::test]
async fn test_create_tag_without_force_rejects_existing_name() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");
    let path = repo.path_str().to_string();
    let head_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    create_tag(
        path.clone(),
        "v1.0.0".to_string(),
        head_oid.to_string(),
        None,
        false,
    )
    .await
    .unwrap();

    let result = create_tag(
        path.clone(),
        "v1.0.0".to_string(),
        head_oid.to_string(),
        None,
        false,
    )
    .await;
    assert!(result.is_err());

    // force=true must overwrite it without error
    create_tag(path, "v1.0.0".to_string(), head_oid.to_string(), None, true)
        .await
        .unwrap();
}

#[tokio::test]
async fn test_delete_tag_removes_it() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello");
    repo.commit("initial commit");
    let path = repo.path_str().to_string();
    let head_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    create_tag(
        path.clone(),
        "to-delete".to_string(),
        head_oid.to_string(),
        None,
        false,
    )
    .await
    .unwrap();
    assert!(list_tags(path.clone())
        .await
        .unwrap()
        .iter()
        .any(|t| t.name == "to-delete"));

    delete_tag(path.clone(), "to-delete".to_string())
        .await
        .unwrap();

    assert!(!list_tags(path)
        .await
        .unwrap()
        .iter()
        .any(|t| t.name == "to-delete"));
}

#[tokio::test]
async fn test_cherry_pick_commit_applies_cleanly() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial commit");
    let main_branch_name = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    create_branch(repo.path_str().to_string(), "feature".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "feature".to_string())
        .await
        .unwrap();
    repo.write_file("other.txt", "from feature");
    repo.commit("add other.txt");
    let feature_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    checkout_branch(repo.path_str().to_string(), main_branch_name)
        .await
        .unwrap();

    let result = cherry_pick_commit(repo.path_str().to_string(), feature_oid.to_string())
        .await
        .unwrap();
    assert_eq!(result, MergeOutcome::Success);
    assert_eq!(
        std::fs::read_to_string(repo.path.join("other.txt")).unwrap(),
        "from feature"
    );
    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head.message().unwrap(), "add other.txt");
}

#[tokio::test]
async fn test_cherry_pick_commit_conflicts_and_abort() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial commit");
    let main_branch_name = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    create_branch(repo.path_str().to_string(), "feature".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "feature".to_string())
        .await
        .unwrap();
    repo.write_file("test.txt", "feature change");
    repo.commit("feature change");
    let feature_oid = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    checkout_branch(repo.path_str().to_string(), main_branch_name)
        .await
        .unwrap();
    repo.write_file("test.txt", "main change");
    repo.commit("main change");

    let result = cherry_pick_commit(repo.path_str().to_string(), feature_oid.to_string())
        .await
        .unwrap();
    assert_eq!(result, MergeOutcome::Conflicts);

    cherry_pick_abort(repo.path_str().to_string())
        .await
        .unwrap();

    assert_eq!(repo.repo.state(), git2::RepositoryState::Clean);
    assert_eq!(
        std::fs::read_to_string(repo.path.join("test.txt")).unwrap(),
        "main change"
    );
}

#[tokio::test]
async fn test_revert_commit_applies_cleanly() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial commit");
    repo.write_file("test.txt", "changed");
    repo.commit("change test.txt");
    let to_revert = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    let result = revert_commit(repo.path_str().to_string(), to_revert.to_string())
        .await
        .unwrap();
    assert_eq!(result, MergeOutcome::Success);
    assert_eq!(
        std::fs::read_to_string(repo.path.join("test.txt")).unwrap(),
        "base"
    );
}

#[tokio::test]
async fn test_revert_commit_conflicts_and_abort() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial commit");
    repo.write_file("test.txt", "changed");
    repo.commit("change test.txt");
    let to_revert = repo.repo.head().unwrap().peel_to_commit().unwrap().id();

    // Overlapping edit on top of the commit-to-revert makes a clean revert
    // impossible, forcing the conflict path.
    repo.write_file("test.txt", "changed again, overlapping the reverted lines");
    repo.commit("further change");

    let result = revert_commit(repo.path_str().to_string(), to_revert.to_string())
        .await
        .unwrap();
    assert_eq!(result, MergeOutcome::Conflicts);

    revert_abort(repo.path_str().to_string()).await.unwrap();

    assert_eq!(repo.repo.state(), git2::RepositoryState::Clean);
    assert_eq!(
        std::fs::read_to_string(repo.path.join("test.txt")).unwrap(),
        "changed again, overlapping the reverted lines"
    );
}

#[tokio::test]
async fn test_fetch_updates_remote_tracking_branch_without_touching_local() {
    use basilico_lib::commands::remote::{fetch, push};

    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");
    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

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

    // Simulate another client pushing a further commit directly to the bare remote.
    let remote_repo = git2::Repository::open(&remote_path).unwrap();
    let remote_head = remote_repo.head().unwrap().peel_to_commit().unwrap();
    let sig = git2::Signature::now("Other", "other@example.com").unwrap();
    let tree = remote_head.tree().unwrap();
    let new_remote_oid = remote_repo
        .commit(
            Some(&format!("refs/heads/{}", branch)),
            &sig,
            &sig,
            "remote side moved on",
            &tree,
            &[&remote_head],
        )
        .unwrap();

    fetch(app, repo.path_str().to_string(), "origin".to_string())
        .await
        .unwrap();

    let tracking_ref = repo
        .repo
        .find_reference(&format!("refs/remotes/origin/{}", branch))
        .unwrap();
    assert_eq!(tracking_ref.target().unwrap(), new_remote_oid);

    // Fetch alone must not move the local working branch.
    let local_head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(local_head.message().unwrap(), "one");
}

#[tokio::test]
async fn test_pull_fast_forwards_local_branch() {
    use basilico_lib::commands::remote::{pull, push};

    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");
    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

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

    let remote_repo = git2::Repository::open(&remote_path).unwrap();
    let remote_head = remote_repo.head().unwrap().peel_to_commit().unwrap();
    let sig = git2::Signature::now("Other", "other@example.com").unwrap();
    let tree = remote_head.tree().unwrap();
    remote_repo
        .commit(
            Some(&format!("refs/heads/{}", branch)),
            &sig,
            &sig,
            "remote commit 2",
            &tree,
            &[&remote_head],
        )
        .unwrap();

    let result = pull(
        app,
        repo.path_str().to_string(),
        "origin".to_string(),
        branch,
        None,
    )
    .await
    .unwrap();
    assert_eq!(result, MergeOutcome::Success);

    let local_head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(local_head.message().unwrap(), "remote commit 2");
}

#[tokio::test]
async fn test_pull_reports_conflicts_and_leaves_them_resolvable() {
    use basilico_lib::commands::remote::{pull, push};

    let repo = TempRepo::new();
    repo.write_file("test.txt", "base");
    repo.commit("initial commit");
    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

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

    // Remote side changes test.txt directly on the bare repo.
    let remote_repo = git2::Repository::open(&remote_path).unwrap();
    let remote_head = remote_repo.head().unwrap().peel_to_commit().unwrap();
    let sig = git2::Signature::now("Other", "other@example.com").unwrap();
    let mut treebuilder = remote_repo.treebuilder(None).unwrap();
    let blob = remote_repo.blob(b"remote change").unwrap();
    treebuilder.insert("test.txt", blob, 0o100644).unwrap();
    let tree_oid = treebuilder.write().unwrap();
    let tree = remote_repo.find_tree(tree_oid).unwrap();
    remote_repo
        .commit(
            Some(&format!("refs/heads/{}", branch)),
            &sig,
            &sig,
            "remote change",
            &tree,
            &[&remote_head],
        )
        .unwrap();

    // Local side changes the same file differently, so the merge cannot be clean.
    repo.write_file("test.txt", "local change");
    repo.commit("local change");

    let result = pull(
        app,
        repo.path_str().to_string(),
        "origin".to_string(),
        branch,
        None,
    )
    .await
    .unwrap();
    assert_eq!(result, MergeOutcome::Conflicts);

    let conflicts = get_conflicts(repo.path_str().to_string()).await.unwrap();
    assert_eq!(conflicts, vec!["test.txt".to_string()]);

    abort_merge(repo.path_str().to_string()).await.unwrap();
}

#[tokio::test]
async fn test_remove_worktree_removes_it() {
    let repo = TempRepo::new();
    repo.write_file("main.txt", "main content");
    repo.commit("initial commit");

    add_worktree(
        repo.path_str().to_string(),
        "wt-remove".to_string(),
        None,
        Some("wt-remove-branch".to_string()),
    )
    .await
    .unwrap();
    assert_eq!(
        list_worktrees(repo.path_str().to_string())
            .await
            .unwrap()
            .len(),
        2
    );

    remove_worktree(repo.path_str().to_string(), "wt-remove".to_string(), false)
        .await
        .unwrap();

    assert_eq!(
        list_worktrees(repo.path_str().to_string())
            .await
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn test_prune_worktrees_clears_stale_administrative_entries() {
    let repo = TempRepo::new();
    repo.write_file("main.txt", "main content");
    repo.commit("initial commit");

    add_worktree(
        repo.path_str().to_string(),
        "wt-prune".to_string(),
        None,
        Some("wt-prune-branch".to_string()),
    )
    .await
    .unwrap();

    // Delete the worktree directory directly, without `worktree remove`, so
    // git's administrative metadata under .git/worktrees/ goes stale.
    std::fs::remove_dir_all(repo.path.join("wt-prune")).unwrap();
    assert_eq!(
        list_worktrees(repo.path_str().to_string())
            .await
            .unwrap()
            .len(),
        2,
        "git still reports the stale entry until it is pruned"
    );

    prune_worktrees(repo.path_str().to_string()).await.unwrap();

    assert_eq!(
        list_worktrees(repo.path_str().to_string())
            .await
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn test_lock_worktree_prevents_removal_until_unlocked() {
    let repo = TempRepo::new();
    repo.write_file("main.txt", "main content");
    repo.commit("initial commit");

    add_worktree(
        repo.path_str().to_string(),
        "wt-lock".to_string(),
        None,
        Some("wt-lock-branch".to_string()),
    )
    .await
    .unwrap();

    lock_worktree(
        repo.path_str().to_string(),
        "wt-lock".to_string(),
        Some("testing lock".to_string()),
    )
    .await
    .unwrap();

    let result = remove_worktree(repo.path_str().to_string(), "wt-lock".to_string(), false).await;
    assert!(result.is_err(), "a locked worktree must refuse removal");

    unlock_worktree(repo.path_str().to_string(), "wt-lock".to_string())
        .await
        .unwrap();

    remove_worktree(repo.path_str().to_string(), "wt-lock".to_string(), false)
        .await
        .unwrap();
    assert_eq!(
        list_worktrees(repo.path_str().to_string())
            .await
            .unwrap()
            .len(),
        1
    );
}

/// The message-grep and author-grep queries run as two concurrent blocking
/// tasks (see `search_commits`) rather than one after another; this guards
/// that the merge/dedupe/sort of their results is still correct.
#[tokio::test]
async fn test_search_commits_merges_message_and_author_matches_without_duplicates() {
    use basilico_lib::commands::search::search_commits;

    let repo = TempRepo::new();
    repo.write_file("a.txt", "one");
    repo.commit("initial commit");

    repo.write_file("a.txt", "two");
    repo.commit("fix: unique-marker in the message");

    // A commit whose message does not match but whose author does.
    repo.write_file("a.txt", "three");
    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();
    let tree_id = index.write_tree().unwrap();
    let tree = repo.repo.find_tree(tree_id).unwrap();
    let sig = git2::Signature::now("Weird Author", "weird@example.com").unwrap();
    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    repo.repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            "unrelated change",
            &tree,
            &[&head],
        )
        .unwrap();

    let by_message = search_commits(repo.path_str().to_string(), "unique-marker".to_string())
        .await
        .unwrap();
    assert_eq!(by_message.len(), 1);
    assert!(by_message[0].message.contains("unique-marker"));

    let by_author = search_commits(repo.path_str().to_string(), "Weird".to_string())
        .await
        .unwrap();
    assert_eq!(by_author.len(), 1);
    assert_eq!(by_author[0].author_name, "Weird Author");

    // Empty query returns recent history unfiltered, with no duplicates even
    // though a commit could in principle match both filters.
    let all = search_commits(repo.path_str().to_string(), String::new())
        .await
        .unwrap();
    assert_eq!(all.len(), 3);
}

/// B14: the query is literal text. Passed to `--grep`/`--author` as a regex,
/// `fix(` made git fail with "Unmatched ( or \(" instead of finding commits.
#[tokio::test]
async fn test_search_commits_treats_the_query_as_literal_text() {
    use basilico_lib::commands::search::search_commits;

    let repo = TempRepo::new();
    repo.write_file("a.txt", "one");
    repo.commit("fix(parser): handle [WIP] markers");
    repo.write_file("a.txt", "two");
    repo.commit("fixparser without the parenthesis");

    for query in ["fix(", "[WIP", "fix(parser)"] {
        let results = search_commits(repo.path_str().to_string(), query.to_string())
            .await
            .unwrap_or_else(|e| panic!("query {:?} failed: {}", query, e.message));
        assert_eq!(results.len(), 1, "query {:?}", query);
        assert!(results[0].message.starts_with("fix(parser)"));
    }
}

/// `get_repo_health` used to hardcode `<repo>/.git`. In a linked worktree that
/// path is a *file*, so every measurement came back as zero and the Doctor
/// panel reported a perfectly healthy, empty repository.
#[tokio::test]
async fn test_repo_health_measures_a_linked_worktree() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "a");
    repo.commit("initial");

    let worktree_path = repo.path.parent().unwrap().join(format!(
        "{}-linked",
        repo.path.file_name().unwrap().to_string_lossy()
    ));

    add_worktree(
        repo.path_str().to_string(),
        worktree_path.to_string_lossy().to_string(),
        None,
        Some("linked-branch".to_string()),
    )
    .await
    .expect("worktree should be created");

    // The app opens a worktree in its own tab before acting on it.
    basilico_lib::state::register_open_repo(&worktree_path.to_string_lossy());
    let report = get_repo_health(worktree_path.to_string_lossy().to_string())
        .await
        .expect("health report for a linked worktree");

    assert!(
        report.git_size_bytes > 0,
        "git directory size should be measured through the worktree's gitdir link"
    );
    assert!(
        report.loose_objects_count > 0,
        "loose objects live in the common directory and must still be counted"
    );

    let _ = std::fs::remove_dir_all(&worktree_path);
}

/// `get_commit_tree` always reported `size: None`, so the file-size column the
/// commit detail view renders was permanently blank.
#[tokio::test]
async fn test_commit_tree_reports_blob_sizes() {
    let repo = TempRepo::new();
    repo.write_file("small.txt", "12345");
    repo.write_file("nested/bigger.txt", "0123456789");
    repo.commit("with files");

    let head = repo.repo.head().unwrap().target().unwrap().to_string();
    let entries = get_commit_tree(repo.path_str().to_string(), head, None)
        .await
        .expect("commit tree");

    let small = entries
        .iter()
        .find(|e| e.path == "small.txt")
        .expect("small.txt in tree");
    assert_eq!(small.size, Some(5));
    assert!(!small.is_dir);

    let nested = entries
        .iter()
        .find(|e| e.path == "nested/bigger.txt")
        .expect("nested file in tree");
    assert_eq!(nested.size, Some(10));

    let dir = entries
        .iter()
        .find(|e| e.is_dir)
        .expect("a directory entry");
    assert_eq!(dir.size, None, "directories have no blob size");
}

/// `open_in_ide` joined a renderer-supplied path onto the repository root and
/// launched an editor on the result. `Path::join` discards the root entirely
/// when the joined path is absolute, and `..` was never rejected, so any path
/// on disk could be opened regardless of which repository was claimed.
#[tokio::test]
async fn test_open_in_ide_rejects_paths_outside_the_repository() {
    use basilico_lib::commands::ide::open_in_ide;

    let repo = TempRepo::new();
    let root = repo.path_str().to_string();

    // Absolute: `Path::join` would silently drop the repo root.
    let result = open_in_ide(
        "/etc/passwd".to_string(),
        None,
        Some("code".to_string()),
        Some(root.clone()),
    )
    .await;
    let err = result.expect_err("an absolute path must not escape the repo root");
    assert!(
        err.message.contains("Absolute paths are not allowed"),
        "must be refused by path validation, not merely fail to launch an \
         editor that isn't installed (got: {})",
        err.message
    );

    // Traversal.
    let result = open_in_ide(
        "../../../etc/passwd".to_string(),
        None,
        Some("code".to_string()),
        Some(root),
    )
    .await;
    let err = result.expect_err("`..` must not escape the repo root");
    assert!(
        err.message.contains("Path traversal is not allowed"),
        "must be refused by path validation (got: {})",
        err.message
    );
}

/// The force-push lease sliced `expected_remote_oid` at byte 7 to build its
/// error message. A multi-byte value landed mid-character and panicked, so the
/// single guard protecting an irreversible overwrite reported an opaque
/// "Task join error" instead of refusing cleanly.
#[tokio::test]
async fn test_force_push_rejects_a_non_oid_lease_without_panicking() {
    use basilico_lib::commands::remote::push;

    let repo = TempRepo::new();
    repo.write_file("a.txt", "one");
    repo.commit("initial commit");
    // Without a remote, `push` returns at find_remote and never reaches the
    // lease check this test is about. The URL is never contacted: the lease is
    // verified against local refs, before any network access.
    repo.repo
        .remote("origin", "https://example.invalid/repo.git")
        .unwrap();
    // A remote-tracking ref, so the lease gets as far as comparing values. With
    // none, `push` returns "no local tracking ref" first and the comparison --
    // and the byte-slicing in its message -- is never reached.
    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    repo.repo
        .reference(
            "refs/remotes/origin/main",
            head.id(),
            true,
            "test tracking ref",
        )
        .unwrap();

    for bogus in [
        "\u{e9}\u{e9}\u{e9}\u{e9}\u{e9}\u{e9}\u{e9}\u{e9}",
        "not-an-oid",
        "",
        "  ",
    ] {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
            .handle()
            .clone();

        let result = push(
            app,
            repo.path_str().to_string(),
            "origin".to_string(),
            "main".to_string(),
            true,
            Some(bogus.to_string()),
        )
        .await;

        let err = result.expect_err("a non-OID lease must be refused");
        assert!(
            !err.message.contains("Task join error"),
            "refusal should be a clean error, not a panic surfacing as a join error (got: {})",
            err.message
        );
        assert!(
            err.message.contains("Refusing to force push"),
            "must be refused by the lease check itself (got: {})",
            err.message
        );
    }
}

// ── Phase 0 regression tests ──────────────────────────────────────────────
//
// Each test below reproduces a bug from the audit and is `#[ignore]`d until
// the phase that fixes it, so CI stays green while the failure stays on
// record. Run them with `cargo test -- --ignored`.

/// B1: the lease must be checked against the *remote*, not against the local
/// remote-tracking ref the expected tip was read from in the first place.
///
/// Another clone pushes after our last fetch. Our tracking ref still holds the
/// old tip, so the UI sends that old tip as the lease — and a lease that only
/// compares against the same local ref always matches, letting the force push
/// overwrite the other clone's commit.
#[tokio::test]
async fn test_force_push_refuses_when_someone_else_pushed_since_last_fetch() {
    use basilico_lib::commands::remote::push;

    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");
    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    let scratch = repo.path.parent().unwrap().to_path_buf();
    let remote_path = scratch.join(format!("lease-shared-{}.git", uuid::Uuid::new_v4()));
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

    // What our UI believes the remote tip is, and will send as the lease.
    let stale_tip = repo
        .repo
        .find_reference(&format!("refs/remotes/origin/{}", branch))
        .unwrap()
        .target()
        .unwrap();

    // Someone else pushes on top of it from their own clone.
    let other_path = scratch.join(format!("lease-other-{}", uuid::Uuid::new_v4()));
    let other = git2::Repository::clone(remote_path.to_str().unwrap(), &other_path).unwrap();
    let base = other
        .find_reference(&format!("refs/remotes/origin/{}", branch))
        .unwrap()
        .peel_to_commit()
        .unwrap();
    let sig = git2::Signature::now("Other", "other@example.com").unwrap();
    let theirs = other
        .commit(
            None,
            &sig,
            &sig,
            "someone else's work",
            &base.tree().unwrap(),
            &[&base],
        )
        .unwrap();
    other
        .reference(&format!("refs/heads/{}", branch), theirs, true, "test")
        .unwrap();
    other
        .find_remote("origin")
        .unwrap()
        .push(&[format!("refs/heads/{0}:refs/heads/{0}", branch)], None)
        .unwrap();

    // We rewrite our own history without fetching, then force push.
    repo.write_file("f.txt", "rewritten");
    repo.commit("rewrite");
    let result = push(
        app,
        repo.path_str().to_string(),
        "origin".to_string(),
        branch.clone(),
        true,
        Some(stale_tip.to_string()),
    )
    .await;

    let remote_tip = git2::Repository::open_bare(&remote_path)
        .unwrap()
        .find_reference(&format!("refs/heads/{}", branch))
        .unwrap()
        .target()
        .unwrap();

    std::fs::remove_dir_all(&remote_path).ok();
    std::fs::remove_dir_all(&other_path).ok();

    let err = result.expect_err("the force push must be refused: the remote moved");
    assert!(
        err.message.contains("Refusing to force push"),
        "got: {}",
        err.message
    );
    assert_eq!(remote_tip, theirs, "the other clone's commit must survive");
}

/// B3: a conflicted path has no stage-0 index entry, so `discard_changes`
/// classified it as untracked and deleted it from disk.
#[tokio::test]
async fn test_discard_on_conflicted_file_does_not_delete_it() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "initial content");
    repo.commit("initial commit");
    let main_branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    create_branch(repo.path_str().to_string(), "other".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "other".to_string())
        .await
        .unwrap();
    repo.write_file("test.txt", "their content");
    repo.commit("theirs");

    checkout_branch(repo.path_str().to_string(), main_branch)
        .await
        .unwrap();
    repo.write_file("test.txt", "our content");
    repo.commit("ours");

    let result = merge_branch(repo.path_str().to_string(), "other".to_string())
        .await
        .unwrap();
    assert_eq!(result, MergeOutcome::Conflicts);

    let err = discard_changes(repo.path_str().to_string(), vec!["test.txt".to_string()])
        .await
        .expect_err("discarding a conflicted file must be refused");
    assert!(
        err.message.contains("cannot be discarded"),
        "got: {}",
        err.message
    );

    assert!(
        repo.path.join("test.txt").exists(),
        "discarding a conflicted file must never delete it"
    );
}

/// B4: reword wrote only the edited summary line as the whole message, so the
/// commit body was silently lost.
#[tokio::test]
async fn test_rebase_reword_keeps_commit_body() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "a");
    repo.commit("initial");
    let base_oid = repo.repo.head().unwrap().target().unwrap();

    repo.write_file("b.txt", "b");
    repo.commit("old subject\n\nA body paragraph that explains why.\n");

    let mut todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    assert_eq!(todos.len(), 1);
    todos[0].action = "reword".to_string();
    todos[0].summary = "new subject".to_string();

    let status = rebase_start(repo.path_str().to_string(), base_oid.to_string(), todos)
        .await
        .unwrap();
    assert_eq!(status.status, RebasePhase::Finished);

    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    let message = head.message().unwrap();
    assert!(message.starts_with("new subject"), "got: {:?}", message);
    assert!(
        message.contains("A body paragraph that explains why."),
        "the body must survive a reword, got: {:?}",
        message
    );
}

/// B4: an unedited squash combines both messages, bodies included, the way
/// `git rebase -i` does by default — it used to keep only one subject line.
#[tokio::test]
async fn test_rebase_squash_without_edit_keeps_both_messages() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "a");
    repo.commit("initial");
    let base_oid = repo.repo.head().unwrap().target().unwrap();

    repo.write_file("b.txt", "b");
    repo.commit("first subject\n\nfirst body\n");
    repo.write_file("c.txt", "c");
    repo.commit("second subject\n\nsecond body\n");

    let mut todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    todos[1].action = "squash".to_string();

    let status = rebase_start(repo.path_str().to_string(), base_oid.to_string(), todos)
        .await
        .unwrap();
    assert_eq!(status.status, RebasePhase::Finished);

    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head.parent(0).unwrap().id(), base_oid);
    assert_eq!(
        head.message().unwrap(),
        "first subject\n\nfirst body\n\nsecond subject\n\nsecond body\n"
    );
}

/// B4: a squash whose subject was edited keeps both bodies under it.
#[tokio::test]
async fn test_rebase_squash_with_edited_subject_keeps_both_bodies() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "a");
    repo.commit("initial");
    let base_oid = repo.repo.head().unwrap().target().unwrap();

    repo.write_file("b.txt", "b");
    repo.commit("first subject\n\nfirst body\n");
    repo.write_file("c.txt", "c");
    repo.commit("second subject\n\nsecond body\n");

    let mut todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
        .await
        .unwrap();
    todos[1].action = "squash".to_string();
    todos[1].summary = "combined subject".to_string();

    rebase_start(repo.path_str().to_string(), base_oid.to_string(), todos)
        .await
        .unwrap();

    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(
        head.message().unwrap(),
        "combined subject\n\nfirst body\n\nsecond body\n"
    );
}

/// Build a merge conflict on `path` where "ours" writes `ours` and "theirs"
/// writes `theirs`; `None` means that side deletes the file.
async fn conflicted_repo(path: &str, ours: Option<&[u8]>, theirs: Option<&[u8]>) -> TempRepo {
    let repo = TempRepo::new();
    std::fs::write(repo.path.join(path), b"base\n").unwrap();
    repo.commit("base");
    let main_branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    let apply = |content: Option<&[u8]>| match content {
        Some(bytes) => std::fs::write(repo.path.join(path), bytes).unwrap(),
        None => std::fs::remove_file(repo.path.join(path)).unwrap(),
    };
    // `TempRepo::commit` stages with `add_all`, which does not record
    // deletions, so stage them explicitly.
    let stage_deletion = |content: Option<&[u8]>| {
        if content.is_none() {
            let mut index = repo.repo.index().unwrap();
            index.remove_path(std::path::Path::new(path)).unwrap();
            index.write().unwrap();
        }
    };

    create_branch(repo.path_str().to_string(), "theirs".to_string(), None)
        .await
        .unwrap();
    checkout_branch(repo.path_str().to_string(), "theirs".to_string())
        .await
        .unwrap();
    apply(theirs);
    stage_deletion(theirs);
    repo.commit("theirs");

    checkout_branch(repo.path_str().to_string(), main_branch)
        .await
        .unwrap();
    apply(ours);
    stage_deletion(ours);
    repo.commit("ours");

    let result = merge_branch(repo.path_str().to_string(), "theirs".to_string())
        .await
        .unwrap();
    assert_eq!(result, MergeOutcome::Conflicts);
    repo
}

/// B15: taking a side used to round-trip the blob through lossy UTF-8 text in
/// the renderer, corrupting binary files. The bytes must survive exactly.
#[tokio::test]
async fn test_resolve_conflict_side_keeps_binary_content_exactly() {
    let ours: &[u8] = &[0x89, b'P', b'N', b'G', 0x00, 0xff, 0xfe, 0x01];
    let theirs: &[u8] = &[0x00, 0x80, 0x81, 0xc3, 0x28, 0xff];

    for (side, expected) in [("ours", ours), ("theirs", theirs)] {
        let repo = conflicted_repo("image.bin", Some(ours), Some(theirs)).await;

        resolve_conflict_side(
            repo.path_str().to_string(),
            "image.bin".to_string(),
            side.to_string(),
        )
        .await
        .unwrap();

        assert_eq!(
            std::fs::read(repo.path.join("image.bin")).unwrap(),
            expected
        );
        let mut index = repo.repo.index().unwrap();
        // `TempRepo` keeps its own handle, whose index is cached in memory.
        index.read(true).unwrap();
        assert!(!index.has_conflicts(), "{side}: conflict must be cleared");
        let entry = index
            .get_path(std::path::Path::new("image.bin"), 0)
            .unwrap();
        assert_eq!(repo.repo.find_blob(entry.id).unwrap().content(), expected);
    }
}

/// B15: when the chosen side deleted the file, the resolution is a deletion —
/// not an empty file.
#[tokio::test]
async fn test_resolve_conflict_side_with_deleting_side_removes_the_file() {
    let repo = conflicted_repo("f.txt", Some(b"ours\n"), None).await;

    resolve_conflict_side(
        repo.path_str().to_string(),
        "f.txt".to_string(),
        "theirs".to_string(),
    )
    .await
    .unwrap();

    assert!(!repo.path.join("f.txt").exists());
    let mut index = repo.repo.index().unwrap();
    index.read(true).unwrap();
    assert!(!index.has_conflicts());
    assert!(index.get_path(std::path::Path::new("f.txt"), 0).is_none());
}

#[tokio::test]
async fn test_resolve_conflict_side_rejects_a_path_not_in_conflict() {
    let repo = conflicted_repo("f.txt", Some(b"ours\n"), Some(b"theirs\n")).await;
    let err = resolve_conflict_side(
        repo.path_str().to_string(),
        "other.txt".to_string(),
        "ours".to_string(),
    )
    .await
    .expect_err("a path that is not conflicted must be refused");
    assert!(
        err.message.contains("not in conflict"),
        "got: {}",
        err.message
    );
}

/// B10: working-tree blame used to blame the committed file and pair its
/// hunks with the *working-tree* lines by index, so one inserted line shifted
/// every line below it onto the wrong commit.
#[tokio::test]
async fn test_blame_accounts_for_local_edits() {
    use basilico_lib::commands::blame::get_file_blame;

    let repo = TempRepo::new();
    repo.write_file("f.txt", "a\nb\nc\n");
    repo.commit("initial");
    let head = repo.repo.head().unwrap().target().unwrap().to_string();

    // A local, uncommitted line at the top.
    repo.write_file("f.txt", "new\na\nb\nc\n");

    let lines = get_file_blame(repo.path_str().to_string(), "f.txt".to_string(), None)
        .await
        .unwrap();
    assert_eq!(lines.len(), 4);

    assert_eq!(lines[0].line_content, "new");
    assert_eq!(lines[0].commit_oid, "", "an uncommitted line has no commit");
    assert_eq!(lines[0].author_name, "Not Committed Yet");

    for line in &lines[1..] {
        assert_eq!(
            line.commit_oid, head,
            "committed line {:?} must keep its commit",
            line.line_content
        );
    }
}

/// B19: blame at a tag resolves through the tag object to its commit.
#[tokio::test]
async fn test_blame_at_an_annotated_tag() {
    use basilico_lib::commands::blame::get_file_blame;

    let repo = TempRepo::new();
    repo.write_file("f.txt", "a\n");
    repo.commit("initial");
    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    let sig = git2::Signature::now("Test User", "test@example.com").unwrap();
    repo.repo
        .tag("v1", head.as_object(), &sig, "release", false)
        .unwrap();

    let lines = get_file_blame(
        repo.path_str().to_string(),
        "f.txt".to_string(),
        Some("v1".to_string()),
    )
    .await
    .unwrap();
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].commit_oid, head.id().to_string());
}

/// B19: a branch can start at an annotated tag.
#[tokio::test]
async fn test_create_branch_from_an_annotated_tag() {
    let repo = TempRepo::new();
    repo.write_file("f.txt", "a\n");
    repo.commit("initial");
    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    let sig = git2::Signature::now("Test User", "test@example.com").unwrap();
    repo.repo
        .tag("v1", head.as_object(), &sig, "release", false)
        .unwrap();

    create_branch(
        repo.path_str().to_string(),
        "from-tag".to_string(),
        Some("v1".to_string()),
    )
    .await
    .unwrap();

    let branch = repo
        .repo
        .find_branch("from-tag", git2::BranchType::Local)
        .unwrap();
    assert_eq!(branch.get().target(), Some(head.id()));
}

/// B11: `StatusEntry::path` is the entry's *old* path, so a staged rename was
/// listed (and staged, and diffed) under the name the file no longer has.
/// Unstaging it by its new name must also restore the old one.
#[tokio::test]
async fn test_staged_rename_is_listed_under_its_new_path_and_unstages_whole() {
    use basilico_lib::git::repository::get_status;
    use std::path::Path;

    let repo = TempRepo::new();
    repo.write_file(
        "old.txt",
        "a file with enough content\nthat git recognises\nthe move as a rename\n",
    );
    repo.commit("initial");

    std::fs::rename(repo.path.join("old.txt"), repo.path.join("new.txt")).unwrap();
    let mut index = repo.repo.index().unwrap();
    index.remove_path(Path::new("old.txt")).unwrap();
    index.add_path(Path::new("new.txt")).unwrap();
    index.write().unwrap();

    let status = get_status(repo.path_str()).unwrap();
    assert_eq!(status.staged.len(), 1, "{:?}", status.staged);
    assert_eq!(status.staged[0].path, "new.txt");
    assert_eq!(
        status.staged[0].status,
        basilico_lib::git::repository::FileChangeKind::Renamed
    );
    assert_eq!(status.staged[0].old_path.as_deref(), Some("old.txt"));

    unstage_files(repo.path_str().to_string(), vec!["new.txt".to_string()])
        .await
        .unwrap();

    let status = get_status(repo.path_str()).unwrap();
    assert!(status.staged.is_empty(), "{:?}", status.staged);
    assert!(status.untracked.contains(&"new.txt".to_string()));
    assert!(status.unstaged.iter().any(|f| f.path == "old.txt"
        && f.status == basilico_lib::git::repository::FileChangeKind::Deleted));
}

/// B11: a type change (a file replaced by a symlink) was not listed at all.
#[cfg(unix)]
#[test]
fn test_status_reports_a_typechange() {
    use basilico_lib::git::repository::get_status;

    let repo = TempRepo::new();
    repo.write_file("target.txt", "x");
    repo.write_file("link", "a plain file for now");
    repo.commit("initial");

    std::fs::remove_file(repo.path.join("link")).unwrap();
    std::os::unix::fs::symlink("target.txt", repo.path.join("link")).unwrap();

    let status = get_status(repo.path_str()).unwrap();
    assert!(
        status.unstaged.iter().any(|f| f.path == "link"
            && f.status == basilico_lib::git::repository::FileChangeKind::Typechange),
        "{:?}",
        status.unstaged
    );
}

/// B12: with hooks enabled, every `#` line was stripped from the message, so
/// an issue-number subject or a Markdown heading silently vanished. `git
/// commit -m` keeps them unless `commit.cleanup = strip`.
#[tokio::test]
async fn test_commit_keeps_hash_lines_unless_cleanup_is_strip() {
    let message = "#123 fix crash\n\n## Details\nbody line  \n\n\n";

    for (cleanup, expected) in [
        (None, "#123 fix crash\n\n## Details\nbody line"),
        (Some("strip"), "body line"),
    ] {
        let repo = TempRepo::new();
        if let Some(mode) = cleanup {
            repo.repo
                .config()
                .unwrap()
                .set_str("commit.cleanup", mode)
                .unwrap();
        }
        repo.write_file("a.txt", "hello");
        let mut index = repo.repo.index().unwrap();
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .unwrap();
        index.write().unwrap();

        create_commit(
            repo.path_str().to_string(),
            message.to_string(),
            None,
            None,
            false,
            false,
        )
        .await
        .unwrap();

        let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(
            head.message().unwrap().trim_end(),
            expected,
            "cleanup mode {:?}",
            cleanup
        );
    }
}

/// B13: with `gpg.format = ssh`, signing used to call `gpg` anyway and every
/// commit failed. It must sign with `ssh-keygen -Y sign`.
#[cfg(unix)]
#[tokio::test]
async fn test_commit_signs_with_ssh_when_gpg_format_is_ssh() {
    let repo = TempRepo::new();

    let key_dir = repo
        .path
        .parent()
        .unwrap()
        .join(format!("sshkey-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&key_dir).unwrap();
    let key_path = key_dir.join("id_ed25519");
    let status = std::process::Command::new("ssh-keygen")
        .args(["-q", "-t", "ed25519", "-N", "", "-C", "test", "-f"])
        .arg(&key_path)
        .status()
        .expect("ssh-keygen must be available");
    assert!(status.success());

    let mut config = repo.repo.config().unwrap();
    config.set_bool("commit.gpgsign", true).unwrap();
    config.set_str("gpg.format", "ssh").unwrap();
    config
        .set_str("user.signingkey", key_path.to_str().unwrap())
        .unwrap();

    repo.write_file("a.txt", "hello");
    let mut index = repo.repo.index().unwrap();
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();

    let oid = create_commit(
        repo.path_str().to_string(),
        "signed".to_string(),
        None,
        None,
        false,
        true,
    )
    .await
    .unwrap();

    let (signature, _) = repo
        .repo
        .extract_signature(&git2::Oid::from_str(&oid).unwrap(), None)
        .expect("the commit must carry a signature");
    let signature = String::from_utf8_lossy(&signature).into_owned();
    std::fs::remove_dir_all(&key_dir).ok();

    assert!(
        signature.contains("BEGIN SSH SIGNATURE"),
        "expected an SSH signature, got: {signature}"
    );
}

/// B16: staging selected lines of an untracked file sends a new-file patch
/// (`--- /dev/null`); the backend must accept it and create the file in the
/// index with just the selected lines.
#[tokio::test]
async fn test_apply_patch_stages_lines_of_an_untracked_file() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "a");
    repo.commit("initial");
    repo.write_file("new.txt", "x\ny\n");

    let patch = "diff --git a/new.txt b/new.txt\n\
                 new file mode 100644\n\
                 --- /dev/null\n\
                 +++ b/new.txt\n\
                 @@ -0,0 +1,1 @@\n\
                 +x\n";
    apply_patch(
        repo.path_str().to_string(),
        patch.to_string(),
        "index".to_string(),
    )
    .await
    .unwrap();

    let mut index = repo.repo.index().unwrap();
    index.read(true).unwrap();
    let entry = index
        .get_path(std::path::Path::new("new.txt"), 0)
        .expect("the file must now be in the index");
    assert_eq!(repo.repo.find_blob(entry.id).unwrap().content(), b"x\n");
}

/// Phase 6: code search streams `git grep` and stops it at the match limit,
/// instead of buffering all of its output first.
#[tokio::test]
async fn test_grep_code_streams_and_stops_at_the_limit() {
    use basilico_lib::commands::search::grep_code;

    let repo = TempRepo::new();
    repo.write_file("few.txt", "needle one\nhay\nneedle two\n");
    repo.write_file("many.txt", &"haystack line\n".repeat(10));
    repo.commit("initial");

    let found = grep_code(repo.path_str().to_string(), "needle".to_string())
        .await
        .unwrap();
    assert_eq!(found.len(), 2);
    assert_eq!(found[0].file_path, "few.txt");
    assert_eq!(found[0].line_number, 1);
    assert_eq!(found[0].content, "needle one");

    let none = grep_code(repo.path_str().to_string(), "absent-text".to_string())
        .await
        .unwrap();
    assert!(
        none.is_empty(),
        "no matches is an empty result, not an error"
    );

    repo.write_file("huge.txt", &"match me\n".repeat(5_000));
    repo.commit("lots of matches");
    let capped = grep_code(repo.path_str().to_string(), "match me".to_string())
        .await
        .expect("stopping git at the limit is not a failure");
    assert_eq!(capped.len(), 2_000);
}

/// Phase 6: the diff editor is not sent binary data decoded as text, nor
/// files too large to lay out; the UI is told why instead.
#[tokio::test]
async fn test_file_content_pair_flags_binary_and_oversized_files() {
    use basilico_lib::commands::diff::{get_file_content_pair, MAX_EDITOR_BYTES};

    let repo = TempRepo::new();
    repo.write_file("text.txt", "hello\n");
    std::fs::write(repo.path.join("image.bin"), [0u8, 159, 146, 150, 0, 1]).unwrap();
    repo.commit("initial");

    repo.write_file("text.txt", "hello world\n");
    let pair =
        match get_file_content_pair(repo.path_str().to_string(), "text.txt".into(), false, None)
            .await
        {
            Ok(pair) => pair,
            Err(e) => panic!("{}", e.message),
        };
    assert_eq!(pair.original, "hello\n");
    assert_eq!(pair.modified, "hello world\n");
    assert!(!pair.is_binary && !pair.too_large);

    std::fs::write(repo.path.join("image.bin"), [0u8, 1, 2, 3]).unwrap();
    let pair =
        match get_file_content_pair(repo.path_str().to_string(), "image.bin".into(), false, None)
            .await
        {
            Ok(pair) => pair,
            Err(e) => panic!("{}", e.message),
        };
    assert!(pair.is_binary);
    assert!(pair.original.is_empty() && pair.modified.is_empty());

    std::fs::write(repo.path.join("text.txt"), "x".repeat(MAX_EDITOR_BYTES + 1)).unwrap();
    let pair =
        match get_file_content_pair(repo.path_str().to_string(), "text.txt".into(), false, None)
            .await
        {
            Ok(pair) => pair,
            Err(e) => panic!("{}", e.message),
        };
    assert!(pair.too_large);
    assert!(pair.original.is_empty() && pair.modified.is_empty());
}

/// Phase 5: repository commands refuse paths that were not opened in a tab,
/// so a compromised renderer cannot run hooks or git against arbitrary
/// directories.
#[tokio::test]
async fn test_commands_refuse_a_repository_that_is_not_open() {
    let dir = std::env::temp_dir().join(format!("basilico-unopened-{}", uuid::Uuid::new_v4()));
    git2::Repository::init(&dir).unwrap();
    let path = dir.to_string_lossy().to_string();

    let err = basilico_lib::commands::repo::get_status(path.clone())
        .await
        .expect_err("an unopened repository must be refused");
    assert!(
        err.message.contains("not a repository open"),
        "got: {}",
        err.message
    );

    let err = create_commit(path.clone(), "x".to_string(), None, None, false, true)
        .await
        .expect_err("committing in an unopened repository must be refused");
    assert!(
        err.message.contains("not a repository open"),
        "got: {}",
        err.message
    );

    // Once opened it is accepted, and closing it revokes that again.
    basilico_lib::state::register_open_repo(&path);
    assert!(basilico_lib::commands::repo::get_status(path.clone())
        .await
        .is_ok());
    basilico_lib::state::unregister_open_repo(&path);
    assert!(basilico_lib::commands::repo::get_status(path.clone())
        .await
        .is_err());

    std::fs::remove_dir_all(&dir).ok();
}

/// Phase 5: on Windows, `\foo` (root, no drive) and `C:foo` (drive, no root)
/// are not "absolute", so they passed validation — and `Path::join` then
/// replaced the repository base with them.
#[cfg(windows)]
#[test]
fn test_validate_path_rejects_windows_rooted_and_drive_relative_paths() {
    use basilico_lib::git::utils::validate_path;
    let base = std::path::Path::new(r"C:\repo");
    for bad in [
        r"\Windows\win.ini",
        r"C:Windows\win.ini",
        r"\\server\share\x",
    ] {
        assert!(
            validate_path(base, std::path::Path::new(bad)).is_err(),
            "{bad} must be refused"
        );
    }
    assert!(validate_path(base, std::path::Path::new(r"src\main.rs")).is_ok());
}

/// A repository with one commit and a bare `origin` it has not pushed to.
fn repo_with_bare_origin() -> (TempRepo, std::path::PathBuf) {
    let repo = TempRepo::new();
    repo.write_file("f.txt", "one");
    repo.commit("one");
    let remote_path = repo
        .path
        .parent()
        .unwrap()
        .join(format!("sync-remote-{}.git", uuid::Uuid::new_v4()));
    git2::Repository::init_bare(&remote_path).unwrap();
    repo.repo
        .remote("origin", remote_path.to_str().unwrap())
        .unwrap();
    (repo, remote_path)
}

fn mock_app() -> tauri::AppHandle<tauri::test::MockRuntime> {
    tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
        .handle()
        .clone()
}

/// A repository whose branch and `origin`'s have each gained one commit since
/// they last agreed, touching different files (so any pull mode can succeed).
async fn diverged_from_origin() -> (TempRepo, std::path::PathBuf, String, git2::Oid) {
    use basilico_lib::commands::remote::push;

    let (repo, remote_path) = repo_with_bare_origin();
    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();
    push(
        mock_app(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch.clone(),
        false,
        None,
    )
    .await
    .unwrap();

    // Someone else's commit on the remote: adds remote.txt.
    let bare = git2::Repository::open_bare(&remote_path).unwrap();
    let base = bare
        .find_reference(&format!("refs/heads/{}", branch))
        .unwrap()
        .peel_to_commit()
        .unwrap();
    let blob = bare.blob(b"from the remote\n").unwrap();
    let mut builder = bare.treebuilder(Some(&base.tree().unwrap())).unwrap();
    builder.insert("remote.txt", blob, 0o100644).unwrap();
    let tree = bare.find_tree(builder.write().unwrap()).unwrap();
    let sig = git2::Signature::now("Other", "other@example.com").unwrap();
    let remote_tip = bare
        .commit(
            Some(&format!("refs/heads/{}", branch)),
            &sig,
            &sig,
            "remote work",
            &tree,
            &[&base],
        )
        .unwrap();

    // Our own commit: adds local.txt.
    repo.write_file("local.txt", "from here\n");
    repo.commit("local work");

    (repo, remote_path, branch, remote_tip)
}

/// Phase 8: `pull.ff = only` / the "fast-forward only" mode refuses to merge
/// diverged histories, with a message that says what to do instead.
#[tokio::test]
async fn test_pull_fast_forward_only_refuses_diverged_history() {
    use basilico_lib::commands::remote::pull;

    let (repo, remote_path, branch, _) = diverged_from_origin().await;
    let before = repo.repo.head().unwrap().target().unwrap();

    let err = pull(
        mock_app(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch,
        Some("ff-only".to_string()),
    )
    .await
    .expect_err("diverged history cannot be fast-forwarded");
    assert!(
        err.message.contains("Cannot fast-forward"),
        "got: {}",
        err.message
    );
    assert_eq!(repo.repo.head().unwrap().target().unwrap(), before);

    std::fs::remove_dir_all(&remote_path).ok();
}

/// Phase 8: the rebase mode replays local commits on top of the remote — no
/// merge commit — and the repository's `pull.rebase` setting selects it when
/// no mode is given, as it does for `git pull`.
#[tokio::test]
async fn test_pull_rebase_mode_and_pull_rebase_config() {
    use basilico_lib::commands::remote::pull;

    for (requested, configured) in [(Some("rebase"), None), (None, Some("true"))] {
        let (repo, remote_path, branch, remote_tip) = diverged_from_origin().await;
        if let Some(value) = configured {
            repo.repo
                .config()
                .unwrap()
                .set_str("pull.rebase", value)
                .unwrap();
        }

        let result = pull(
            mock_app(),
            repo.path_str().to_string(),
            "origin".to_string(),
            branch,
            requested.map(str::to_string),
        )
        .await
        .unwrap();
        assert_eq!(result, MergeOutcome::Success);

        let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.parent_count(), 1, "a rebase leaves no merge commit");
        assert_eq!(head.parent(0).unwrap().id(), remote_tip);
        assert_eq!(head.summary().unwrap(), Some("local work"));
        assert!(repo.path.join("remote.txt").exists());
        assert!(repo.path.join("local.txt").exists());

        std::fs::remove_dir_all(&remote_path).ok();
    }
}

/// Without a mode or any `pull.*` config, pull still merges, as before.
#[tokio::test]
async fn test_pull_defaults_to_merge() {
    use basilico_lib::commands::remote::pull;

    let (repo, remote_path, branch, remote_tip) = diverged_from_origin().await;
    let result = pull(
        mock_app(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch,
        None,
    )
    .await
    .unwrap();
    assert_eq!(result, MergeOutcome::Success);

    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(
        head.parent_count(),
        2,
        "a merge commit joins both histories"
    );
    assert!(head.parent_ids().any(|id| id == remote_tip));

    std::fs::remove_dir_all(&remote_path).ok();
}

/// B2: the first push of an unpublished branch sets its upstream, as
/// `git push -u` does — otherwise ahead/behind read 0/0 forever.
#[tokio::test]
async fn test_push_publishes_a_branch_and_sets_its_upstream() {
    use basilico_lib::commands::remote::push;

    let (repo, remote_path) = repo_with_bare_origin();
    let branch = repo.repo.head().unwrap().shorthand().unwrap().to_string();

    push(
        mock_app(),
        repo.path_str().to_string(),
        "origin".to_string(),
        branch.clone(),
        false,
        None,
    )
    .await
    .unwrap();

    let local = repo
        .repo
        .find_branch(&branch, git2::BranchType::Local)
        .unwrap();
    let upstream = local
        .upstream()
        .expect("upstream must be set after publishing");
    assert_eq!(
        upstream.name().unwrap().unwrap(),
        format!("origin/{}", branch)
    );

    std::fs::remove_dir_all(&remote_path).ok();
}

/// B2: a branch tracking a differently-named remote branch pushes to *that*
/// branch, not to a new branch with the local name.
#[tokio::test]
async fn test_push_goes_to_the_upstream_branch_even_with_a_different_name() {
    use basilico_lib::commands::remote::push;

    let (repo, remote_path) = repo_with_bare_origin();
    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    repo.repo.branch("feature", &head, false).unwrap();

    // Publish `feature` as `origin/shared`, then track it.
    let mut remote = repo.repo.find_remote("origin").unwrap();
    remote
        .push(&["refs/heads/feature:refs/heads/shared"], None)
        .unwrap();
    let mut feature = repo
        .repo
        .find_branch("feature", git2::BranchType::Local)
        .unwrap();
    feature.set_upstream(Some("origin/shared")).unwrap();

    checkout_branch(repo.path_str().to_string(), "feature".to_string())
        .await
        .unwrap();
    repo.write_file("f.txt", "two");
    repo.commit("two");
    let new_tip = repo.repo.head().unwrap().target().unwrap();

    push(
        mock_app(),
        repo.path_str().to_string(),
        "origin".to_string(),
        "feature".to_string(),
        false,
        None,
    )
    .await
    .unwrap();

    let bare = git2::Repository::open_bare(&remote_path).unwrap();
    assert_eq!(
        bare.find_reference("refs/heads/shared").unwrap().target(),
        Some(new_tip)
    );
    assert!(
        bare.find_reference("refs/heads/feature").is_err(),
        "no new remote branch named after the local one"
    );

    std::fs::remove_dir_all(&remote_path).ok();
}

/// B2: on a detached HEAD the current "branch" is the literal `HEAD`, and
/// pushing it created a branch called `HEAD` on the remote.
#[tokio::test]
async fn test_push_and_pull_refuse_a_detached_head() {
    use basilico_lib::commands::remote::{pull, push};

    let (repo, remote_path) = repo_with_bare_origin();

    let err = push(
        mock_app(),
        repo.path_str().to_string(),
        "origin".to_string(),
        "HEAD".to_string(),
        false,
        None,
    )
    .await
    .expect_err("pushing a detached HEAD must be refused");
    assert!(
        err.message.contains("detached HEAD"),
        "got: {}",
        err.message
    );

    let err = pull(
        mock_app(),
        repo.path_str().to_string(),
        "origin".to_string(),
        "HEAD".to_string(),
        None,
    )
    .await
    .expect_err("pulling into a detached HEAD must be refused");
    assert!(
        err.message.contains("detached HEAD"),
        "got: {}",
        err.message
    );

    let bare = git2::Repository::open_bare(&remote_path).unwrap();
    assert!(bare.find_reference("refs/heads/HEAD").is_err());

    std::fs::remove_dir_all(&remote_path).ok();
}

/// B19: deleting a conflicted file and marking it resolved must record the
/// deletion; `add_path` on the missing file used to fail.
#[tokio::test]
async fn test_resolve_conflict_accepts_a_deleted_file() {
    let repo = conflicted_repo("f.txt", Some(b"ours\n"), Some(b"theirs\n")).await;
    std::fs::remove_file(repo.path.join("f.txt")).unwrap();

    resolve_conflict(repo.path_str().to_string(), "f.txt".to_string())
        .await
        .unwrap();

    let mut index = repo.repo.index().unwrap();
    index.read(true).unwrap();
    assert!(!index.has_conflicts());
    assert!(index.get_path(std::path::Path::new("f.txt"), 0).is_none());
}

/// Amending must start from the full message: the graph only has subjects.
#[tokio::test]
async fn test_get_commit_message_returns_subject_and_body() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "a");
    repo.commit("subject line\n\nThe body explains why.\n");

    let message = get_commit_message(repo.path_str().to_string(), "HEAD".to_string())
        .await
        .unwrap();
    assert_eq!(message, "subject line\n\nThe body explains why.\n");
}

/// A staged rename must diff against the file's old name in HEAD, not show the
/// whole file as added.
#[tokio::test]
async fn test_content_pair_for_staged_rename_reads_head_under_old_name() {
    let repo = TempRepo::new();
    repo.write_file("old.txt", "one\ntwo\n");
    repo.commit("add old");

    std::fs::rename(repo.path.join("old.txt"), repo.path.join("new.txt")).unwrap();
    std::fs::write(repo.path.join("new.txt"), "one\ntwo\nthree\n").unwrap();
    let git = git2::Repository::open(&repo.path).unwrap();
    let mut index = git.index().unwrap();
    index.remove_path(std::path::Path::new("old.txt")).unwrap();
    index.add_path(std::path::Path::new("new.txt")).unwrap();
    index.write().unwrap();

    let pair = basilico_lib::commands::diff::get_file_content_pair(
        repo.path_str().to_string(),
        "new.txt".to_string(),
        true,
        Some("old.txt".to_string()),
    )
    .await
    .unwrap();
    assert_eq!(pair.original, "one\ntwo\n");
    assert_eq!(pair.modified, "one\ntwo\nthree\n");

    // Without the old name the HEAD side is (correctly) empty — that was the bug.
    let pair = basilico_lib::commands::diff::get_file_content_pair(
        repo.path_str().to_string(),
        "new.txt".to_string(),
        true,
        None,
    )
    .await
    .unwrap();
    assert_eq!(pair.original, "");
}

/// Comparing across a rename reads the base side under the base's path.
#[tokio::test]
async fn test_content_pair_revisions_reads_base_under_its_own_path() {
    let repo = TempRepo::new();
    repo.write_file("old.txt", "v1\n");
    repo.commit("add old");
    let base = git2::Repository::open(&repo.path)
        .unwrap()
        .head()
        .unwrap()
        .target()
        .unwrap()
        .to_string();
    std::fs::rename(repo.path.join("old.txt"), repo.path.join("new.txt")).unwrap();
    repo.write_file("new.txt", "v2\n");
    repo.commit("rename");

    let pair = basilico_lib::commands::diff::get_file_content_pair_revisions(
        repo.path_str().to_string(),
        "new.txt".to_string(),
        base,
        "HEAD".to_string(),
        Some("old.txt".to_string()),
    )
    .await
    .unwrap();
    assert_eq!(pair.original, "v1\n");
    assert_eq!(pair.modified, "v2\n");
}

/// The extra path is validated like the main one.
#[tokio::test]
async fn test_content_pair_rejects_escaping_original_path() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "a");
    repo.commit("init");

    let err = basilico_lib::commands::diff::get_file_content_pair(
        repo.path_str().to_string(),
        "a.txt".to_string(),
        true,
        Some("../outside.txt".to_string()),
    )
    .await
    .unwrap_err();
    assert!(err.message.contains("traversal"), "got: {}", err.message);
}

/// A root commit's changes are viewed as a comparison against git's empty
/// tree, which libgit2 resolves without the object being in the repository.
#[tokio::test]
async fn test_compare_root_commit_against_the_empty_tree() {
    let repo = TempRepo::new();
    repo.write_file("first.txt", "hello\n");
    repo.commit("root");

    let diffs = basilico_lib::commands::diff::get_compare_diff(
        repo.path_str().to_string(),
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904".to_string(),
        "HEAD".to_string(),
    )
    .await
    .unwrap();
    assert_eq!(diffs.len(), 1);
    assert_eq!(diffs[0].new_path.as_deref(), Some("first.txt"));

    let pair = basilico_lib::commands::diff::get_file_content_pair_revisions(
        repo.path_str().to_string(),
        "first.txt".to_string(),
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904".to_string(),
        "HEAD".to_string(),
        None,
    )
    .await
    .unwrap();
    assert_eq!(pair.original, "");
    assert_eq!(pair.modified, "hello\n");
}

/// Spawned processes have no controlling terminal, so ssh or pinentry cannot
/// stop and wait on the terminal Basilico was started from.
#[cfg(unix)]
#[test]
fn test_spawned_commands_have_no_controlling_terminal() {
    let output = basilico_lib::commands::new_command("sh")
        .args([
            "-c",
            "if (exec 3</dev/tty) 2>/dev/null; then echo tty; else echo none; fi",
        ])
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "none");
}

/// The File Tree view lists one folder at a time instead of the whole tree.
#[tokio::test]
async fn test_commit_tree_lists_one_folder_at_a_time() {
    let repo = TempRepo::new();
    repo.write_file("README.md", "readme");
    repo.write_file("src/main.rs", "fn main() {}");
    repo.write_file("src/util/mod.rs", "");
    repo.commit("tree");
    let head = repo.repo.head().unwrap().target().unwrap().to_string();
    let path = repo.path_str().to_string();

    let root = get_commit_tree(path.clone(), head.clone(), Some(String::new()))
        .await
        .unwrap();
    let names: Vec<_> = root.iter().map(|e| (e.path.as_str(), e.is_dir)).collect();
    // Folders first, and nothing from inside them.
    assert_eq!(names, vec![("src", true), ("README.md", false)]);

    let src = get_commit_tree(path.clone(), head.clone(), Some("src".to_string()))
        .await
        .unwrap();
    let names: Vec<_> = src.iter().map(|e| e.path.as_str()).collect();
    assert_eq!(names, vec!["src/util", "src/main.rs"]);
    assert_eq!(src[1].size, Some(12));

    let err = get_commit_tree(path, head, Some("README.md".to_string()))
        .await
        .unwrap_err();
    assert!(err.message.contains("not a folder"), "got: {}", err.message);
}
