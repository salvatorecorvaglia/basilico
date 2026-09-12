/* ═══════════════════════════════════════════════════════
   Basilico — Tauri Command Errors
   One owner for error reporting, so a failure raises one toast
   ═══════════════════════════════════════════════════════ */

import { useUIStore } from "../store/ui-store";
import type { ErrorKind } from "./git-types";

/**
 * A failed Tauri command, as a real `Error`.
 *
 * Rust's `AppError` is serialised by serde as a plain `{ message, kind }`
 * object, and rethrowing that object directly meant every `${err}` in a catch
 * block rendered `[object Object]` — which is what ~60 error toasts across the
 * app actually said. A plain object has no `toString`, and `impl Display for
 * AppError` on the Rust side never crosses the IPC boundary.
 *
 * `message` carries the user-facing text, already passed through
 * `friendlyErrorMessage`, so interpolating this error anywhere produces
 * something readable. The untranslated text stays on `rawMessage` for logs.
 */
export class GitCommandError extends Error {
  readonly kind: ErrorKind;
  readonly rawMessage: string;
  /**
   * Whether a toast has already been shown for this failure.
   *
   * `invokeCommand` raises one unless the caller asked for `silent`, and the
   * store actions then rethrow — so component catch blocks were adding a second
   * toast for the same failure. Callers report through [`reportError`], which
   * honours this flag, rather than deciding for themselves.
   */
  reported: boolean;

  constructor(
    message: string,
    kind: ErrorKind,
    rawMessage: string,
    reported: boolean,
  ) {
    super(message);
    this.name = "GitCommandError";
    this.kind = kind;
    this.rawMessage = rawMessage;
    this.reported = reported;
  }
}

/**
 * Surface a caught error to the user, unless it has already been surfaced.
 *
 * Use this instead of calling `addNotification` from a catch block: most
 * failures travel up from `invokeCommand`, which has already shown a toast
 * carrying a friendlier message than the call site can produce.
 */
export function reportError(err: unknown, prefix: string): void {
  if (err instanceof GitCommandError && err.reported) return;

  const detail = err instanceof Error ? err.message : String(err);
  useUIStore.getState().addNotification({
    type: "error",
    message: `${prefix}: ${detail}`,
  });
}
