/* ═══════════════════════════════════════════════════════
Basilico — Git Doctor & Lost Work Recovery Commands
Repository storage health, git gc/fsck, dangling commit recovery
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use git2::Repository;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    pub total_size_bytes: u64,
    pub git_size_bytes: u64,
    pub loose_objects_count: u64,
    pub packfiles_count: u64,
    pub lfs_objects_count: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DanglingCommitInfo {
    pub oid: String,
    pub short_oid: String,
    pub message: String,
    pub author_name: String,
    pub date: i64,
    pub action_subject: String,
}

/// Directories skipped when measuring repository size — they are build output or
/// dependency caches, not repository content, and walking them can take minutes.
const SKIPPED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    "out",
    "vendor",
    "coverage",
    ".cache",
];

/// Guards against pathological trees. Symlinks are never followed (see below),
/// but deeply nested real directories should not blow the stack either.
const MAX_WALK_DEPTH: usize = 64;

fn is_skipped_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|name| SKIPPED_DIRS.contains(&name))
        .unwrap_or(false)
}

fn dir_size_inner(path: &Path, depth: usize) -> u64 {
    if depth >= MAX_WALK_DEPTH {
        return 0;
    }
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            // symlink_metadata does not follow links, so a symlink cycle
            // (`ln -s .. loop`) can never recurse into itself.
            let Ok(meta) = entry.metadata_no_follow() else {
                continue;
            };
            if meta.is_file() {
                total += meta.len();
            } else if meta.is_dir() {
                let p = entry.path();
                if !is_skipped_dir(&p) {
                    total += dir_size_inner(&p, depth + 1);
                }
            }
        }
    }
    total
}

fn dir_size<P: AsRef<Path>>(path: P) -> u64 {
    dir_size_inner(path.as_ref(), 0)
}

fn count_files_inner(path: &Path, matcher: &dyn Fn(&Path) -> bool, depth: usize) -> u64 {
    if depth >= MAX_WALK_DEPTH {
        return 0;
    }
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata_no_follow() else {
                continue;
            };
            let p = entry.path();
            if meta.is_file() {
                if matcher(&p) {
                    count += 1;
                }
            } else if meta.is_dir() && !is_skipped_dir(&p) {
                count += count_files_inner(&p, matcher, depth + 1);
            }
        }
    }
    count
}

fn count_files_with_ext<P: AsRef<Path>>(path: P, ext: &str) -> u64 {
    let ext = ext.to_string();
    count_files_inner(
        path.as_ref(),
        &move |p: &Path| p.extension().map(|e| e == ext.as_str()).unwrap_or(false),
        0,
    )
}

/// Counts every regular file under `path`, regardless of extension.
/// LFS objects are stored without a file extension, so an extension filter
/// would always match nothing.
fn count_all_files<P: AsRef<Path>>(path: P) -> u64 {
    count_files_inner(path.as_ref(), &|_p: &Path| true, 0)
}

/// `DirEntry::metadata` already avoids following the link on most platforms, but
/// the contract is not guaranteed across all of them; go through
/// `symlink_metadata` explicitly so the no-follow behaviour is unambiguous.
trait NoFollowMetadata {
    fn metadata_no_follow(&self) -> std::io::Result<fs::Metadata>;
}

impl NoFollowMetadata for fs::DirEntry {
    fn metadata_no_follow(&self) -> std::io::Result<fs::Metadata> {
        fs::symlink_metadata(self.path())
    }
}

fn count_loose_objects<P: AsRef<Path>>(git_dir: P) -> u64 {
    let obj_dir = git_dir.as_ref().join("objects");
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(obj_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    if name.len() == 2 && name.chars().all(|c| c.is_ascii_hexdigit()) {
                        if let Ok(files) = fs::read_dir(p) {
                            count += files.flatten().count() as u64;
                        }
                    }
                }
            }
        }
    }
    count
}

#[tauri::command]
pub async fn get_repo_health(path: String) -> Result<DoctorReport, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo_path = Path::new(&path);

        // `.git` is a *file* in a linked worktree or a submodule, so joining it
        // literally measured nothing and reported a perfectly healthy empty
        // repository. Ask libgit2 where the real directories are — the same
        // resolution the file watcher already performs.
        let git_dirs = crate::watcher::resolve_git_dirs(repo_path);

        // Object storage lives in the *common* directory, which for a linked
        // worktree is the main repository's `.git`, not the worktree's own.
        let object_store = git_dirs
            .last()
            .cloned()
            .unwrap_or_else(|| repo_path.join(".git"));

        let git_size_bytes = git_dirs.iter().map(dir_size).sum();
        let total_size_bytes = dir_size(repo_path);
        let loose_objects_count = count_loose_objects(&object_store);
        let packfiles_count =
            count_files_with_ext(object_store.join("objects").join("pack"), "pack");
        let lfs_objects_count = if object_store.join("lfs").exists() {
            count_all_files(object_store.join("lfs"))
        } else {
            0
        };

        Ok(DoctorReport {
            total_size_bytes,
            git_size_bytes,
            loose_objects_count,
            packfiles_count,
            lfs_objects_count,
        })
    })
    .await?
}

#[tauri::command]
pub async fn run_git_gc(path: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        let stdout = crate::commands::run_git_cmd(&["gc", "--prune=now"], &path)?;
        if stdout.is_empty() {
            Ok("Repository optimized successfully (git gc completed)".to_string())
        } else {
            Ok(stdout)
        }
    })
    .await?
}

#[tauri::command]
pub async fn run_git_fsck(path: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        // `fsck` can exit non-zero while still just reporting non-fatal notes,
        // so the exit status is intentionally not checked here — the combined
        // output is shown to the user either way, not treated as a Rust error.
        let output = crate::commands::git_output(&["fsck", "--full"], &path)?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        let combined = format!("{}\n{}", stdout, stderr).trim().to_string();
        if combined.is_empty() {
            Ok("No corruption found. Repository object database is clean.".to_string())
        } else {
            Ok(combined)
        }
    })
    .await?
}

#[tauri::command]
pub async fn find_dangling_commits(path: String) -> Result<Vec<DanglingCommitInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;

        // 1. Collect all reachable commit OIDs from branches & tags & HEAD
        let mut reachable_oids: HashSet<git2::Oid> = HashSet::new();

        let mut revwalk = repo.revwalk()?;
        let _ = revwalk.push_head();
        for r in repo.references()?.flatten() {
            if let Ok(commit_ref) = r.peel(git2::ObjectType::Commit) {
                let _ = revwalk.push(commit_ref.id());
            }
        }
        for oid in revwalk.flatten() {
            reachable_oids.insert(oid);
        }

        // 2. Read HEAD reference log to check for unreachable dangling commits
        let mut dangling = Vec::new();
        let mut seen = HashSet::new();

        if let Ok(head_log) = repo.reflog("HEAD") {
            for entry in head_log.iter() {
                let new_id = entry.id_new();
                let old_id = entry.id_old();

                for oid in [new_id, old_id] {
                    if oid.is_zero() || reachable_oids.contains(&oid) || seen.contains(&oid) {
                        continue;
                    }
                    seen.insert(oid);

                    if let Ok(commit) = repo.find_commit(oid) {
                        let author = commit.author();
                        let message = commit
                            .message()
                            .unwrap_or("")
                            .lines()
                            .next()
                            .unwrap_or("")
                            .to_string();

                        dangling.push(DanglingCommitInfo {
                            oid: oid.to_string(),
                            short_oid: oid.to_string()[..7.min(oid.to_string().len())].to_string(),
                            message,
                            author_name: author.name().unwrap_or("").to_string(),
                            date: author.when().seconds(),
                            action_subject: entry
                                .message()
                                .ok()
                                .flatten()
                                .unwrap_or("")
                                .to_string(),
                        });
                    }
                }
            }
        }

        Ok(dangling)
    })
    .await?
}
