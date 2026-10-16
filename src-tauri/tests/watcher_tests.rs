/* ═══════════════════════════════════════════════════════
Basilico — Watcher Unit Tests
═══════════════════════════════════════════════════════ */

use basilico_lib::test_utils::TempRepo;
use basilico_lib::watcher::{
    is_conventionally_ignored, is_ref_change, is_significant_event, is_significant_path,
    resolve_git_dirs,
};
use std::path::{Path, PathBuf};

#[test]
fn test_is_significant_path() {
    assert!(is_significant_path("src/main.rs"));
    assert!(is_significant_path("Cargo.toml"));
    assert!(!is_significant_path(".git/index.lock"));
    assert!(!is_significant_path(".git/objects/ab/cdef"));
    assert!(!is_significant_path(".git/FETCH_HEAD"));
    assert!(!is_significant_path("src/main.rs.swp"));
    assert!(!is_significant_path("src/main.rs~"));
    assert!(!is_significant_path(".DS_Store"));
}

/// Without a repository to ask, the conventional names are the fallback — and
/// they are matched on the path *relative to the repository root*.
#[test]
fn test_fallback_ignore_names_apply_relative_to_the_repo_root() {
    let root = Path::new("/home/dev/build/repo");
    let git_dirs = [root.join(".git")];

    for name in [
        ".venv",
        "venv",
        "__pycache__",
        "Pods",
        "bin",
        "obj",
        "node_modules",
        "target",
        "dist",
    ] {
        assert!(
            is_conventionally_ignored(name),
            "{name} should be conventionally ignored"
        );
        let path = root.join(name).join("thing.txt");
        assert!(
            !is_significant_event(&path, root, &git_dirs, None),
            "a write under {name} should not be significant"
        );
    }

    // `build` in the repository's own location is irrelevant.
    assert!(is_significant_event(
        &root.join("src/main.rs"),
        root,
        &git_dirs,
        None
    ));
    assert!(is_significant_event(
        &root.join("binary_data/notes.txt"),
        root,
        &git_dirs,
        None
    ));
}

/// B6: every component of the *absolute* event path was checked against the
/// conventional ignore names, so a repository that merely lives under a
/// directory called `build`, `tmp`, `out`, … never auto-refreshed, and
/// committed source under `src/bin/` was ignored too.
#[test]
fn test_repo_under_a_conventionally_named_directory_still_refreshes() {
    assert!(is_significant_path("/home/dev/build/myrepo/src/main.rs"));
    assert!(is_significant_path("/tmp/scratch/myrepo/README.md"));
    assert!(is_significant_path("src/bin/main.rs"));
}

/// B6: with a real repository, its own `.gitignore` decides — not a fixed list.
#[test]
fn test_significance_follows_the_repositorys_gitignore() {
    let repo = TempRepo::new();
    repo.write_file(".gitignore", "generated/\n*.log\n");
    repo.write_file("src/bin/main.rs", "fn main() {}");
    repo.commit("initial");

    let root = repo.path.clone();
    let git_dirs = resolve_git_dirs(&root);
    let handle = Some(&repo.repo);

    // Committed source under names the old list ignored.
    assert!(is_significant_event(
        &root.join("src/bin/main.rs"),
        &root,
        &git_dirs,
        handle
    ));
    assert!(is_significant_event(
        &root.join("vendor/lib.go"),
        &root,
        &git_dirs,
        handle
    ));
    // What the repository itself ignores.
    assert!(!is_significant_event(
        &root.join("generated/out.js"),
        &root,
        &git_dirs,
        handle
    ));
    assert!(!is_significant_event(
        &root.join("debug.log"),
        &root,
        &git_dirs,
        handle
    ));
    // Git metadata counts, apart from transient files.
    let git_dir: PathBuf = git_dirs[0].clone();
    assert!(is_significant_event(
        &git_dir.join("refs/heads/main"),
        &root,
        &git_dirs,
        handle
    ));
    assert!(!is_significant_event(
        &git_dir.join("index.lock"),
        &root,
        &git_dirs,
        handle
    ));
}

/// B9: ref and HEAD movements are what require the commit log to reload.
#[test]
fn test_ref_changes_are_recognised() {
    let git_dir = PathBuf::from("/repo/.git");
    let git_dirs = [git_dir.clone()];

    assert!(is_ref_change(&git_dir.join("HEAD"), &git_dirs));
    assert!(is_ref_change(&git_dir.join("refs/heads/main"), &git_dirs));
    assert!(is_ref_change(
        &git_dir.join("refs/remotes/origin/main"),
        &git_dirs
    ));
    assert!(is_ref_change(&git_dir.join("packed-refs"), &git_dirs));

    assert!(!is_ref_change(&git_dir.join("index"), &git_dirs));
    assert!(!is_ref_change(Path::new("/repo/src/HEAD"), &git_dirs));
    assert!(!is_ref_change(Path::new("/repo/refs/notes.txt"), &git_dirs));
}
