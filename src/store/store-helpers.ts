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

/**
 * In-flight operations per loading domain.
 *
 * The flags were plain booleans, so when two operations in one domain
 * overlapped, the first to finish cleared the flag while the other was still
 * running — the spinner vanished early, and a guard like `loadMoreCommits`'s
 * `loadingStates.commits` check let a duplicate request through.
 */
const inFlight = new Map<keyof RepoState["loadingStates"], number>();

/** Helper to update a single loading domain flag and recalculate isLoading */
export function setLoading(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  value: boolean,
) {
  // The store flag is the source of truth: if something reset it (closing a
  // tab resets per-tab state), operations counted before that no longer count.
  let count = get().loadingStates[domain] ? (inFlight.get(domain) ?? 0) : 0;
  count = Math.max(0, count + (value ? 1 : -1));
  inFlight.set(domain, count);

  const newLoadingStates = { ...get().loadingStates, [domain]: count > 0 };
  set({
    loadingStates: newLoadingStates,
    isLoading: computeIsLoading(newLoadingStates),
  });
}

/**
 * Run a store action against the active repository, under a loading flag.
 * Does nothing (resolving to `undefined`) when no repository is open.
 *
 * Most store actions opened with the same three steps — read `activeTabId`,
 * return if there is none, wrap the work in `withLoading` — repeated around
 * thirty times across the slices.
 */
export async function withActiveRepo<T>(
  get: () => RepoState,
  set: (s: Partial<RepoState>) => void,
  domain: keyof RepoState["loadingStates"],
  errorLabel: string,
  fn: (activeTabId: string) => Promise<T>,
): Promise<T | undefined> {
  const { activeTabId } = get();
  if (!activeTabId) return undefined;
  return withLoading(get, set, domain, errorLabel, () => fn(activeTabId));
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
