use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use uuid::Uuid;

pub struct TempRepo {
    pub path: PathBuf,
    pub repo: git2::Repository,
}

impl Default for TempRepo {
    fn default() -> Self {
        Self::new()
    }
}

impl TempRepo {
    pub fn new() -> Self {
        let uuid = Uuid::new_v4().to_string();
        // The system temp dir, not `src-tauri/target/`: that sits inside this
        // project's own work tree, so anything that walks upward looking for a
        // repository (`Repository::discover`) could find Basilico's instead.
        // Canonicalized because macOS's temp dir is behind the `/var` →
        // `/private/var` symlink, and the commands under test canonicalize the
        // paths they return.
        let base = fs::canonicalize(std::env::temp_dir()).unwrap();
        let mut path = base.join("basilico-tests");
        path.push(format!("test-repo-{}", uuid));
        fs::create_dir_all(&path).unwrap();

        let repo = git2::Repository::init(&path).unwrap();
        // Commands refuse repositories that were not opened in a tab; a test
        // repository stands for one that was.
        crate::state::register_open_repo(path.to_str().unwrap());
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        Self { path, repo }
    }

    pub fn write_file(&self, name: &str, content: &str) {
        let file_path = self.path.join(name);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut file = File::create(file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
    }

    pub fn remove_file(&self, name: &str) {
        let file_path = self.path.join(name);
        fs::remove_file(file_path).unwrap();
    }

    pub fn commit(&self, msg: &str) {
        let mut index = self.repo.index().unwrap();
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = self.repo.find_tree(tree_id).unwrap();
        let sig = self.repo.signature().unwrap();

        let mut parents = Vec::new();
        if let Ok(head) = self.repo.head() {
            parents.push(head.peel_to_commit().unwrap());
        }

        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
        self.repo
            .commit(Some("HEAD"), &sig, &sig, msg, &tree, &parent_refs)
            .unwrap();
    }

    pub fn path_str(&self) -> &str {
        self.path.to_str().unwrap()
    }
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        crate::state::unregister_open_repo(self.path.to_str().unwrap());
        let _ = fs::remove_dir_all(&self.path);
    }
}
