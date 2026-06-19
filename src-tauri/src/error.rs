use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize, Clone)]
pub struct AppError {
    pub message: String,
    pub kind: ErrorKind,
}

#[derive(Debug, Serialize, Clone)]
pub enum ErrorKind {
    GitError,
    IoError,
    NotFound,
    InvalidState,
    WatcherError,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<git2::Error> for AppError {
    fn from(err: git2::Error) -> Self {
        AppError {
            message: err.message().to_string(),
            kind: ErrorKind::GitError,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError {
            message: err.to_string(),
            kind: ErrorKind::IoError,
        }
    }
}

impl From<notify::Error> for AppError {
    fn from(err: notify::Error) -> Self {
        AppError {
            message: err.to_string(),
            kind: ErrorKind::WatcherError,
        }
    }
}

// Tauri commands need Result<T, String> or impl Serialize for errors
impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.message
    }
}
