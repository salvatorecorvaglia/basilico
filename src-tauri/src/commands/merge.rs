use crate::error::AppError;
use git2::{build::CheckoutBuilder, MergeOptions, Repository};
use std::path::Path;

#[tauri::command]
pub async fn merge_branch(path: String, branch_name: String) -> Result<String, AppError> {
    let repo = Repository::open(&path)?;

    // Find the branch reference
    let ref_name = format!("refs/heads/{}", branch_name);
    let reference = repo
        .find_reference(&ref_name)
        .or_else(|_| repo.find_reference(&format!("refs/remotes/{}", branch_name)))?;

    let annotated = repo.reference_to_annotated_commit(&reference)?;

    let (merge_analysis, _) = repo.merge_analysis(&[&annotated])?;

    if merge_analysis.is_up_to_date() {
        return Ok("success".to_string());
    }

    if merge_analysis.is_fast_forward() {
        let target_oid = annotated.id();
        let target_object = repo.find_object(target_oid, None)?;
        let mut checkout_opts = CheckoutBuilder::new();
        checkout_opts.safe();
        repo.checkout_tree(&target_object, Some(&mut checkout_opts))?;

        let head_ref = repo.find_reference("HEAD")?;
        if let Some(refname) = head_ref.symbolic_target() {
            let mut real_ref = repo.find_reference(refname)?;
            real_ref.set_target(target_oid, &format!("merge: fast-forward to {}", target_oid))?;
        } else {
            repo.set_head_detached(target_oid)?;
        }
        return Ok("success".to_string());
    }

    let mut merge_opts = MergeOptions::new();
    let mut checkout_opts = CheckoutBuilder::new();
    checkout_opts.safe();

    repo.merge(
        &[&annotated],
        Some(&mut merge_opts),
        Some(&mut checkout_opts),
    )?;

    if repo.index().map(|idx| idx.has_conflicts()).unwrap_or(false) {
        Ok("conflicts".to_string())
    } else {
        // Create merge commit to finalize the merge
        let head = repo.head()?.peel_to_commit()?;
        let remote_commit = repo.find_commit(annotated.id())?;
        let sig = repo.signature().unwrap_or_else(|_| {
            git2::Signature::now("Basilico User", "user@basilico.app").unwrap()
        });
        let mut index = repo.index()?;
        let tree_oid = index.write_tree()?;
        let tree = repo.find_tree(tree_oid)?;
        let msg = format!("Merge branch '{}'", branch_name);
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &msg,
            &tree,
            &[&head, &remote_commit],
        )?;
        repo.cleanup_state()?;
        Ok("success".to_string())
    }
}

#[tauri::command]
pub async fn abort_merge(path: String) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;

    // Clean up merge state files
    repo.cleanup_state()?;

    if let Ok(head_ref) = repo.head() {
        if let Ok(commit) = head_ref.peel_to_commit() {
            repo.reset(commit.as_object(), git2::ResetType::Hard, None)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_conflicts(path: String) -> Result<Vec<String>, AppError> {
    let repo = Repository::open(&path)?;
    let index = repo.index()?;
    let mut conflicts = Vec::new();

    if let Ok(index_conflicts) = index.conflicts() {
        for entry in index_conflicts {
            if let Ok(conflict) = entry {
                let path_str = if let Some(our) = conflict.our {
                    Some(String::from_utf8_lossy(&our.path).to_string())
                } else if let Some(their) = conflict.their {
                    Some(String::from_utf8_lossy(&their.path).to_string())
                } else {
                    None
                };

                if let Some(p) = path_str {
                    if !conflicts.contains(&p) {
                        conflicts.push(p);
                    }
                }
            }
        }
    }

    Ok(conflicts)
}

#[tauri::command]
pub async fn resolve_conflict(path: String, file_path: String) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let mut index = repo.index()?;

    // Adding resolved file to index clears conflict in git
    index.add_path(Path::new(&file_path))?;
    index.write()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TempRepo;
    use crate::commands::branch::create_branch;

    #[tokio::test]
    async fn test_merge_branch_fast_forward() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello");
        repo.commit("initial commit");

        // Save main branch name
        let main_branch_name = repo.repo.head().unwrap().shorthand().unwrap().to_string();

        // Create branch and commit on it
        create_branch(repo.path_str().to_string(), "branch1".to_string(), None).await.unwrap();
        
        // Checkout branch1
        crate::commands::branch::checkout_branch(repo.path_str().to_string(), "branch1".to_string()).await.unwrap();
        repo.write_file("test2.txt", "hello2");
        repo.commit("commit 2");

        // Go back to main
        crate::commands::branch::checkout_branch(repo.path_str().to_string(), main_branch_name.clone()).await.unwrap();

        // Merge branch1 (which should be a fast-forward)
        let result = merge_branch(repo.path_str().to_string(), "branch1".to_string()).await.unwrap();
        assert_eq!(result, "success");

        // Verify that main's HEAD has moved to commit 2's target
        let main_head = repo.repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(main_head.message().unwrap(), "commit 2");
    }

    #[tokio::test]
    async fn test_merge_branch_merge_commit() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello");
        repo.commit("initial commit");

        // Save main branch name
        let main_branch_name = repo.repo.head().unwrap().shorthand().unwrap().to_string();

        // Create branch1 and commit on it
        create_branch(repo.path_str().to_string(), "branch1".to_string(), None).await.unwrap();
        crate::commands::branch::checkout_branch(repo.path_str().to_string(), "branch1".to_string()).await.unwrap();
        repo.write_file("test1.txt", "hello branch 1");
        repo.commit("commit branch 1");

        // Go back to main and commit on it
        crate::commands::branch::checkout_branch(repo.path_str().to_string(), main_branch_name.clone()).await.unwrap();
        repo.write_file("test2.txt", "hello branch 2");
        repo.commit("commit branch 2");

        // Merge branch1 into main (should be a normal merge, not fast-forward)
        let result = merge_branch(repo.path_str().to_string(), "branch1".to_string()).await.unwrap();
        assert_eq!(result, "success");

        // Verify a merge commit was created
        let head_commit = repo.repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head_commit.parent_count(), 2);
        assert_eq!(head_commit.message().unwrap(), "Merge branch 'branch1'");
    }
}
