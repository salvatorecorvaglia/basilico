import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { useRepoStore } from "../../src/store/repo-store";
import { PER_TAB_RESET_STATE } from "../../src/store/types";

/**
 * Store fields that deliberately survive a tab switch.
 *
 * Anything not listed here is per-tab data and must appear in
 * `PER_TAB_RESET_STATE`, or switching repositories leaves it showing the
 * previous repository's values. That is not a hypothetical: the graph filters
 * were missing from the reset, so a path filter typed for one repository was
 * silently applied to the next one's log.
 */
const INTENTIONALLY_GLOBAL = new Set([
  // Shared loading surface.
  "loadingStates",
  "isLoading",
  "isRefreshing",
  // Tab bookkeeping and app-level preferences.
  "tabs",
  "activeTabId",
  "hasRestored",
  "recentRepos",
  "settings",
  // Managed by activateTab itself: it is incremented on every switch rather
  // than reset to a fixed value, which is what invalidates in-flight responses.
  "refreshGeneration",
]);

describe("PER_TAB_RESET_STATE", () => {
  it("covers every per-tab field in the store", () => {
    const state = useRepoStore.getState() as unknown as Record<string, unknown>;
    const dataFields = Object.keys(state).filter(
      (key) => typeof state[key] !== "function",
    );
    const covered = new Set(Object.keys(PER_TAB_RESET_STATE));

    const missing = dataFields.filter(
      (key) => !covered.has(key) && !INTENTIONALLY_GLOBAL.has(key),
    );

    expect(
      missing,
      `These store fields are neither reset per tab nor listed as global. ` +
        `Add them to PER_TAB_RESET_STATE in src/store/types.ts, or to ` +
        `INTENTIONALLY_GLOBAL here if they really are app-wide.`,
    ).toEqual([]);
  });

  it("does not claim to reset fields the store does not have", () => {
    const state = useRepoStore.getState() as unknown as Record<string, unknown>;
    const stale = Object.keys(PER_TAB_RESET_STATE).filter(
      (key) => !(key in state),
    );
    expect(
      stale,
      "PER_TAB_RESET_STATE lists fields that no longer exist",
    ).toEqual([]);
  });

  it("never resets a global field", () => {
    const overlap = Object.keys(PER_TAB_RESET_STATE).filter((key) =>
      INTENTIONALLY_GLOBAL.has(key),
    );
    expect(
      overlap,
      "Resetting these would discard app-level state on every tab switch",
    ).toEqual([]);
  });
});
