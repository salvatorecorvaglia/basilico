/* ═══════════════════════════════════════════════════════
Basilico — Watcher Unit Tests
═══════════════════════════════════════════════════════ */

use basilico_lib::watcher::is_significant_path;

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
