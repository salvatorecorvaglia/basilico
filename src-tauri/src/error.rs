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
    GpgError,
    SettingsError,
    SubmoduleError,
    ConflictError,
    CommandError,
    Unknown,
}

impl AppError {
    pub fn new<S: Into<String>>(message: S, kind: ErrorKind) -> Self {
        AppError {
            message: message.into(),
            kind,
        }
    }

    pub fn git<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::GitError)
    }

    pub fn io<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::IoError)
    }

    pub fn not_found<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::NotFound)
    }

    pub fn invalid_state<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::InvalidState)
    }

    pub fn watcher<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::WatcherError)
    }

    pub fn gpg<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::GpgError)
    }

    pub fn settings<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::SettingsError)
    }

    pub fn submodule<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::SubmoduleError)
    }

    pub fn conflict<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::ConflictError)
    }

    pub fn command<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::CommandError)
    }

    pub fn unknown<S: Into<String>>(message: S) -> Self {
        Self::new(message, ErrorKind::Unknown)
    }
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

