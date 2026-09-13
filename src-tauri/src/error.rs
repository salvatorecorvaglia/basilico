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
    /// Map libgit2's own error code onto an [`ErrorKind`] where one fits.
    ///
    /// Everything used to collapse into `GitError`, so the frontend could not
    /// tell "no such branch" from "authentication failed" except by matching on
    /// the message text — which is exactly what `error-messages.ts` ended up
    /// doing. The message is still carried through unchanged; this only makes
    /// the kind informative.
    fn from(err: git2::Error) -> Self {
        let kind = match err.code() {
            git2::ErrorCode::NotFound => ErrorKind::NotFound,
            git2::ErrorCode::Conflict | git2::ErrorCode::Unmerged => ErrorKind::ConflictError,
            git2::ErrorCode::Auth | git2::ErrorCode::Certificate => ErrorKind::GitError,
            _ => ErrorKind::GitError,
        };
        AppError {
            message: err.message().to_string(),
            kind,
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

impl From<tokio::task::JoinError> for AppError {
    fn from(err: tokio::task::JoinError) -> Self {
        AppError {
            message: format!("Task join error: {}", err),
            kind: ErrorKind::Unknown,
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError {
            message: err.to_string(),
            kind: ErrorKind::SettingsError,
        }
    }
}
