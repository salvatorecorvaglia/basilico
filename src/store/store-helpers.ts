/* ═══════════════════════════════════════════════════════
   Basilico — Shared Store Helpers
   Extracted from duplicated setLoading implementations
   ═══════════════════════════════════════════════════════ */

import type { RepoState } from "./types";

/** Recalculate whether ANY domain loading flag is set */
function computeIsLoading(loadingStates: RepoState["loadingStates"]): boolean {
  return (
    loadingStates.global ||
    loadingStates.commits ||
    loadingStates.status ||
    loadingStates.diff ||
    loadingStates.staging ||
    loadingStates.branches ||
    loadingStates.blame ||
    loadingStates.history ||
    loadingStates.stashes ||
    loadingStates.search ||
    loadingStates.collaboration ||
    loadingStates.settings
  );
}

/** Helper to update a single loading domain flag and recalculate isLoading */
export function setLoading(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  value: boolean,
) {
  const newLoadingStates = { ...get().loadingStates, [domain]: value };
  set({
    loadingStates: newLoadingStates,
    isLoading: computeIsLoading(newLoadingStates),
  });
}

/** Helper to set a per-domain error */
export function setError(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: string,
  message: string | null,
) {
  set({
    error: message, // backward compat: also set the global error
    errors: { ...get().errors, [domain]: message },
  });
}

/** Helper to clear a per-domain error */
export function clearError(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: string,
) {
  set({
    errors: { ...get().errors, [domain]: null },
  });
}

/**
 * Wrapper that handles the loading/error/finally boilerplate for store actions.
 *
 * Sets loading flag, clears error, runs the action, catches errors,
 * and resets loading flag in finally block.
 */
export async function withLoading<T>(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  errorLabel: string,
  fn: () => Promise<T>,
): Promise<T> {
  setLoading(get, set, domain, true);
  clearError(get, set, domain);
  try {
    return await fn();
  } catch (err) {
    console.error(`${errorLabel}:`, err);
    setError(get, set, domain, String(err));
    throw err;
  } finally {
    setLoading(get, set, domain, false);
  }
}
