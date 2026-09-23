/* ═══════════════════════════════════════════════════════
Basilico — Watcher Unit Tests
═══════════════════════════════════════════════════════ */

use basilico_lib::watcher::{is_conventionally_ignored, is_significant_path};

#[test]
fn test_is_significant_path() {
    assert!(is_significant_path("src/main.rs"));
    assert!(is_significant_path("Cargo.toml"));
    assert!(!is_significant_path(".git/index.lock"));
    assert!(!is_significant_path("node_modules/lodash/index.js"));
    assert!(!is_significant_path(
        "packages/app/node_modules/react/index.js"
    ));
    assert!(!is_significant_path("target/debug/basilico"));
    assert!(!is_significant_path(
        "/Users/dev/project/target/debug/basilico"
    ));
    assert!(!is_significant_path("apps/web/.next/cache/data.json"));
    assert!(!is_significant_path("src/main.rs.swp"));
    assert!(!is_significant_path("src/main.rs~"));
    assert!(!is_significant_path(".DS_Store"));
}

/// The two ignore lists used to be maintained separately and had drifted:
/// `is_significant_path` never covered the Python/Xcode/.NET conventions that
/// `is_conventionally_ignored` did, so writes under those directories still
/// woke the watcher. They must now agree by construction.
#[test]
fn test_ignore_lists_agree_on_every_conventional_name() {
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
        assert!(
            !is_significant_path(&format!("repo/{name}/thing.txt")),
            "a write under {name} should not be significant"
        );
    }

    // Names that are not build output must still come through.
    assert!(is_significant_path("repo/src/main.rs"));
    assert!(is_significant_path("repo/binary_data/notes.txt"));
}
