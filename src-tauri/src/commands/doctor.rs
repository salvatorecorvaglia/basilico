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

fn dir_size<P: AsRef<Path>>(path: P) -> u64 {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Ok(meta) = entry.metadata() {
                    total += meta.len();
                }
            } else if p.is_dir() {
                total += dir_size(p);
            }
        }
    }
    total
}

fn count_files_with_ext<P: AsRef<Path>>(path: P, ext: &str) -> u64 {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if p.extension().map(|e| e == ext).unwrap_or(false) {
                    count += 1;
                }
            } else if p.is_dir() {
                count += count_files_with_ext(p, ext);
            }
        }
    }
    count
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
        let git_dir = repo_path.join(".git");

        let git_size_bytes = dir_size(&git_dir);
        let total_size_bytes = dir_size(repo_path);
        let loose_objects_count = count_loose_objects(&git_dir);
        let packfiles_count = count_files_with_ext(git_dir.join("objects").join("pack"), "pack");
        let lfs_objects_count = if git_dir.join("lfs").exists() {
            count_files_with_ext(git_dir.join("lfs"), "")
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
        let output = crate::commands::new_command("git")
            .arg("-C")
            .arg(&path)
            .arg("gc")
            .arg("--prune=now")
            .output()
            .map_err(|e| AppError::command(format!("Failed to execute git gc: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::command(format!("git gc error: {}", stderr)));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
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
        let output = crate::commands::new_command("git")
            .arg("-C")
            .arg(&path)
            .arg("fsck")
            .arg("--full")
            .output()
            .map_err(|e| AppError::command(format!("Failed to execute git fsck: {}", e)))?;

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
                            action_subject: entry.message().unwrap_or("").to_string(),
                        });
                    }
                }
            }
        }

        Ok(dangling)
    })
    .await?
}
