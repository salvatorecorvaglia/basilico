//! Progress reporting and cancellation for network operations (clone, fetch,
//! pull, push).
//!
//! These used to show nothing but a spinner — no indication of how far a
//! large clone had got — and could not be stopped once started. Each operation
//! is now registered under a key (the repository path, or the destination path
//! of a clone), reports `git:progress` events while it runs, and can be
//! cancelled through [`cancel`].

use crate::error::AppError;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};

/// The event name the frontend listens for.
pub const PROGRESS_EVENT: &str = "git:progress";

/// How often progress is reported at most, so a fast transfer does not flood
/// the IPC channel with thousands of events.
const MIN_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    /// The repository path (or clone destination) the operation runs for.
    pub key: String,
    pub operation_id: String,
    /// `clone`, `fetch`, `pull` or `push`.
    pub operation: String,
    /// `receiving`, `resolving` or `uploading`.
    pub phase: String,
    pub current: usize,
    pub total: usize,
    pub bytes: usize,
    /// Sent once when the operation ends, however it ended.
    pub done: bool,
}

type Emitter = Arc<dyn Fn(ProgressPayload) + Send + Sync>;

static OPERATIONS: LazyLock<parking_lot::Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| parking_lot::Mutex::new(HashMap::new()));

/// Ask the operation running under `key` to stop. Returns whether one was
/// running.
pub fn cancel(operation_id: &str) -> bool {
    let flag = OPERATIONS.lock().get(operation_id).cloned();
    if let Some(flag) = flag {
        flag.store(true, Ordering::SeqCst);
        crate::git::prompts::cancel_operation(operation_id);
        true
    } else {
        false
    }
}

/// A running network operation. Dropping it unregisters the operation and
/// reports it as done.
pub struct NetworkOperation {
    key: String,
    operation_id: String,
    operation: &'static str,
    cancelled: Arc<AtomicBool>,
    emit: Emitter,
    /// Asks the user for credentials or host-key trust, when there is a UI.
    prompter: Option<crate::git::prompts::PromptSession>,
}

impl NetworkOperation {
    /// Register an operation under `key`, reporting through `app`.
    pub fn begin<R: tauri::Runtime>(
        key: &str,
        operation: &'static str,
        app: tauri::AppHandle<R>,
    ) -> NetworkOperation {
        use tauri::Emitter as _;
        let prompt_app = app.clone();
        let emit: Emitter = Arc::new(move |payload: ProgressPayload| {
            let _ = app.emit(PROGRESS_EVENT, payload);
        });
        let mut op = Self::begin_with(key, operation, emit);
        let close_app = prompt_app.clone();
        op.prompter = Some(crate::git::prompts::PromptSession {
            prompter: Arc::new(move |request| {
                let _ = prompt_app.emit(crate::git::prompts::PROMPT_EVENT, request);
            }),
            operation_id: op.operation_id.clone(),
            cancelled: Arc::clone(&op.cancelled),
            close: Arc::new(move |id| {
                let _ = close_app.emit(crate::git::prompts::PROMPT_CLOSED_EVENT, id);
            }),
        });
        op
    }

    /// Register an operation that reports through `emit` (tests use this).
    pub fn begin_with(key: &str, operation: &'static str, emit: Emitter) -> NetworkOperation {
        let cancelled = Arc::new(AtomicBool::new(false));
        let operation_id = uuid::Uuid::new_v4().to_string();
        OPERATIONS
            .lock()
            .insert(operation_id.clone(), Arc::clone(&cancelled));
        emit(ProgressPayload {
            key: key.to_string(),
            operation_id: operation_id.clone(),
            operation: operation.to_string(),
            phase: "connecting".into(),
            current: 0,
            total: 0,
            bytes: 0,
            done: false,
        });
        NetworkOperation {
            operation_id,
            key: key.to_string(),
            operation,
            cancelled,
            emit,
            prompter: None,
        }
    }

    pub fn id(&self) -> &str {
        &self.operation_id
    }
    pub fn cancellation(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.cancelled)
    }

    pub fn lock_repository<'a>(
        &self,
        mutation: &'a parking_lot::Mutex<()>,
    ) -> Result<parking_lot::MutexGuard<'a, ()>, AppError> {
        loop {
            if self.is_cancelled() {
                return Err(AppError::invalid_state(format!(
                    "The {} was cancelled.",
                    self.operation
                )));
            }
            if let Some(guard) = mutation.try_lock_for(Duration::from_millis(50)) {
                return Ok(guard);
            }
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// A reporter for this operation's remote callbacks.
    pub fn reporter(&self) -> ProgressReporter {
        ProgressReporter {
            key: self.key.clone(),
            operation_id: self.operation_id.clone(),
            operation: self.operation,
            cancelled: Arc::clone(&self.cancelled),
            emit: Arc::clone(&self.emit),
            prompter: self.prompter.clone(),
            last_emit: None,
        }
    }

    /// Turn a libgit2 failure caused by a cancellation into a clear message.
    pub fn finish<T>(&self, result: Result<T, git2::Error>) -> Result<T, AppError> {
        result.map_err(|e| {
            if self.is_cancelled() {
                AppError::invalid_state(format!("The {} was cancelled.", self.operation))
            } else {
                e.into()
            }
        })
    }
}

impl Drop for NetworkOperation {
    fn drop(&mut self) {
        OPERATIONS.lock().remove(&self.operation_id);
        crate::git::prompts::cancel_operation(&self.operation_id);

        (self.emit)(ProgressPayload {
            key: self.key.clone(),
            operation_id: self.operation_id.clone(),
            operation: self.operation.to_string(),
            phase: String::new(),
            current: 0,
            total: 0,
            bytes: 0,
            done: true,
        });
    }
}

/// Reports progress from inside libgit2's remote callbacks.
pub struct ProgressReporter {
    key: String,
    operation_id: String,
    operation: &'static str,
    cancelled: Arc<AtomicBool>,
    emit: Emitter,
    prompter: Option<crate::git::prompts::PromptSession>,
    last_emit: Option<Instant>,
}

impl ProgressReporter {
    /// How to ask the user something mid-operation, if there is a UI to ask.
    pub fn prompter(&self) -> Option<crate::git::prompts::PromptSession> {
        self.prompter.clone()
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Report a transfer step, throttled except for the final one.
    pub fn report(&mut self, phase: &str, current: usize, total: usize, bytes: usize) {
        let finished = total > 0 && current >= total;
        let now = Instant::now();
        if !finished {
            if let Some(last) = self.last_emit {
                if now.duration_since(last) < MIN_INTERVAL {
                    return;
                }
            }
        }
        self.last_emit = Some(now);
        (self.emit)(ProgressPayload {
            key: self.key.clone(),
            operation_id: self.operation_id.clone(),
            operation: self.operation.to_string(),
            phase: phase.to_string(),
            current,
            total,
            bytes,
            done: false,
        });
    }

    /// Report a fetch-side step from libgit2's statistics.
    pub fn report_transfer(&mut self, stats: &git2::Progress) {
        if stats.received_objects() < stats.total_objects() {
            self.report(
                "receiving",
                stats.received_objects(),
                stats.total_objects(),
                stats.received_bytes(),
            );
        } else {
            self.report(
                "resolving",
                stats.indexed_deltas(),
                stats.total_deltas(),
                stats.received_bytes(),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recorder() -> (Emitter, Arc<parking_lot::Mutex<Vec<ProgressPayload>>>) {
        let events = Arc::new(parking_lot::Mutex::new(Vec::new()));
        let sink = Arc::clone(&events);
        let emit: Emitter = Arc::new(move |p| sink.lock().push(p));
        (emit, events)
    }

    #[test]
    fn cancel_reaches_the_running_operation_and_names_it_in_the_error() {
        let (emit, _) = recorder();
        let op = NetworkOperation::begin_with("/repo/cancel-me", "fetch", emit);
        assert!(!op.is_cancelled());

        assert!(cancel(op.id()));
        assert!(op.is_cancelled());
        assert!(op.reporter().is_cancelled());

        let err = op
            .finish::<()>(Err(git2::Error::from_str("user cancelled")))
            .unwrap_err();
        assert_eq!(err.message, "The fetch was cancelled.");
    }

    #[test]
    fn a_failure_that_was_not_a_cancellation_keeps_its_message() {
        let (emit, _) = recorder();
        let op = NetworkOperation::begin_with("/repo/fails", "push", emit);
        let err = op
            .finish::<()>(Err(git2::Error::from_str("connection refused")))
            .unwrap_err();
        assert_eq!(err.message, "connection refused");
    }

    #[test]
    fn ending_unregisters_and_reports_done() {
        let (emit, events) = recorder();
        {
            let _op = NetworkOperation::begin_with("/repo/done", "clone", emit);
        }
        assert!(!cancel("/repo/done"), "nothing is running any more");
        let events = events.lock();
        let last = events.last().expect("a done event");
        assert!(last.done);
        assert_eq!(last.operation, "clone");
        assert_eq!(last.key, "/repo/done");
    }

    #[test]
    fn progress_is_throttled_but_the_final_step_always_arrives() {
        let (emit, events) = recorder();
        let op = NetworkOperation::begin_with("/repo/throttle", "fetch", emit);
        let mut reporter = op.reporter();
        for i in 0..50 {
            reporter.report("receiving", i, 100, i * 10);
        }
        reporter.report("receiving", 100, 100, 1000);

        let events = events.lock();
        assert!(
            events.len() < 10,
            "{} events were not throttled",
            events.len()
        );
        let last = events.last().unwrap();
        assert_eq!((last.current, last.total), (100, 100));
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    #[test]
    fn operation_ids_isolate_concurrent_operations_for_the_same_repository() {
        let events = Arc::new(parking_lot::Mutex::new(Vec::new()));
        let sink = events.clone();
        let emit: Emitter = Arc::new(move |event| sink.lock().push(event));
        let first = NetworkOperation::begin_with("/same/repo", "fetch", emit.clone());
        let second = NetworkOperation::begin_with("/same/repo", "push", emit);
        let first_id = first.id().to_owned();
        let second_id = second.id().to_owned();
        assert_ne!(first_id, second_id);
        assert!(cancel(&first_id));
        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
        drop(first);
        assert!(!cancel(&first_id));
        assert!(cancel(&second_id));
        let events = events.lock();
        assert!(events
            .iter()
            .any(|event| event.done && event.operation_id == first_id));
        assert!(!events
            .iter()
            .any(|event| event.done && event.operation_id == second_id));
    }

    #[test]
    fn cancelling_a_queued_network_operation_does_not_wait_for_the_lock() {
        let lock = Arc::new(parking_lot::Mutex::new(()));
        let guard = lock.lock();
        let op = NetworkOperation::begin_with("/queued/repo", "fetch", Arc::new(|_| {}));
        let id = op.id().to_owned();
        let queued_lock = lock.clone();
        let (finished_tx, finished_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let result = op.lock_repository(&queued_lock);
            finished_tx.send(result.is_err()).unwrap();
        });
        assert!(cancel(&id));
        assert!(finished_rx.recv_timeout(Duration::from_secs(2)).unwrap());
        drop(guard);
        worker.join().unwrap();
    }
}
