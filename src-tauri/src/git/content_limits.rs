//! Shared limits for text displayed over IPC. Check before allocating file/blob content.
use std::io::Read;
use std::path::Path;

pub const MAX_TEXT_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_TEXT_LINES: usize = 20_000;
pub const MAX_LINE_BYTES: usize = 16 * 1024;

/// None means oversized, including a file that grows after the metadata check.
pub fn read_file(path: &Path) -> std::io::Result<Option<Vec<u8>>> {
    let file = std::fs::File::open(path)?;
    if file.metadata()?.len() > MAX_TEXT_BYTES as u64 {
        return Ok(None);
    }
    let mut bytes = Vec::new();
    file.take(MAX_TEXT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    Ok((bytes.len() <= MAX_TEXT_BYTES).then_some(bytes))
}

pub fn check_blob(repo: &git2::Repository, oid: git2::Oid) -> Result<bool, git2::Error> {
    let (size, kind) = repo.odb()?.read_header(oid)?;
    Ok(kind == git2::ObjectType::Blob && size <= MAX_TEXT_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_oversized_files_before_reading() {
        let dir = crate::test_utils::TempRepo::new();
        let path = dir.path.as_path().join("large");
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_TEXT_BYTES as u64 + 1).unwrap();
        assert!(read_file(&path).unwrap().is_none());
        std::fs::write(&path, "small").unwrap();
        assert_eq!(read_file(&path).unwrap().unwrap(), b"small");
    }
}
