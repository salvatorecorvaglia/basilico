/* ═══════════════════════════════════════════════════════
   Basilico — Shared Store Helpers
   Extracted from duplicated setLoading implementations
   ═══════════════════════════════════════════════════════ */

import type { RepoState } from "./types";

/**
 * Recalculate whether ANY domain loading flag is set.
 *
 * Derived from the object rather than a hand-written list of all twelve
 * domains: a domain added to `LoadingStates` but forgotten here would have been
 * silently excluded from `isLoading`, so a spinner bound to it would never
 * appear and nothing would fail.
 */
function computeIsLoading(loadingStates: RepoState["loadingStates"]): boolean {
  return Object.values(loadingStates).some(Boolean);
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

/**
 * Wrapper that handles the loading/finally boilerplate for store actions.
 *
 * Sets loading flag, runs the action, logs and rethrows on failure (the
 * caller is expected to surface it via a toast notification — this store has
 * no error state of its own to display), and resets loading flag in finally.
 */
export async function withLoading<T>(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  errorLabel: string,
  fn: () => Promise<T>,
): Promise<T> {
  setLoading(get, set, domain, true);
  try {
    return await fn();
  } catch (err) {
    console.error(`${errorLabel}:`, err);
    throw err;
  } finally {
    setLoading(get, set, domain, false);
  }
}
