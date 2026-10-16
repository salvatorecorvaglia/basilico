//! Secrets kept in the operating system's credential store — macOS Keychain,
//! Windows Credential Manager, or the Secret Service on Linux — instead of in
//! `settings.json`.
//!
//! The GitHub token used to sit in `settings.json` in plaintext: mode 0600 on
//! Unix, but readable by any process running as the user, included in every
//! backup of the config directory, and with no file protection at all on
//! Windows.

use crate::error::AppError;

/// The credential-store service every Basilico secret is filed under.
const SERVICE: &str = "com.salvatorecorvaglia.basilico";

/// The entry holding the GitHub personal access token.
const GITHUB_PAT: &str = "github-pat";

/// An in-memory stand-in for the credential store, for tests: CI runners have
/// no Keychain session or Secret Service to talk to.
#[cfg(any(test, feature = "test-utils"))]
static IN_MEMORY: parking_lot::Mutex<Option<std::collections::HashMap<String, String>>> =
    parking_lot::Mutex::new(None);

/// Route every secret through an in-memory map instead of the OS store.
#[cfg(any(test, feature = "test-utils"))]
pub fn use_in_memory_store() {
    let mut store = IN_MEMORY.lock();
    if store.is_none() {
        *store = Some(std::collections::HashMap::new());
    }
}

fn entry(name: &str) -> Result<keyring::Entry, AppError> {
    keyring::Entry::new(SERVICE, name).map_err(|e| {
        AppError::settings(format!(
            "The system credential store is not available ({}), so the token cannot be \
             stored securely.",
            e
        ))
    })
}

fn get(name: &str) -> Result<Option<String>, AppError> {
    #[cfg(any(test, feature = "test-utils"))]
    {
        if let Some(store) = IN_MEMORY.lock().as_ref() {
            return Ok(store.get(name).cloned());
        }
    }

    match entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::settings(format!(
            "Could not read from the system credential store: {}",
            e
        ))),
    }
}

fn set(name: &str, value: &str) -> Result<(), AppError> {
    #[cfg(any(test, feature = "test-utils"))]
    {
        if let Some(store) = IN_MEMORY.lock().as_mut() {
            store.insert(name.to_string(), value.to_string());
            return Ok(());
        }
    }

    entry(name)?.set_password(value).map_err(|e| {
        AppError::settings(format!(
            "Could not save to the system credential store: {}",
            e
        ))
    })
}

fn delete(name: &str) -> Result<(), AppError> {
    #[cfg(any(test, feature = "test-utils"))]
    {
        if let Some(store) = IN_MEMORY.lock().as_mut() {
            store.remove(name);
            return Ok(());
        }
    }

    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::settings(format!(
            "Could not remove the token from the system credential store: {}",
            e
        ))),
    }
}

/// The stored GitHub token, if there is one.
pub fn github_pat() -> Result<Option<String>, AppError> {
    Ok(get(GITHUB_PAT)?.filter(|t| !t.trim().is_empty()))
}

/// Store the GitHub token, or remove it when `token` is empty.
pub fn set_github_pat(token: &str) -> Result<(), AppError> {
    let token = token.trim();
    if token.is_empty() {
        delete(GITHUB_PAT)
    } else {
        set(GITHUB_PAT, token)
    }
}
