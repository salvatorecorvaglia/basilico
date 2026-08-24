/* ═══════════════════════════════════════════════════════
   Basilico — Repository Store
   Assembled from modular domain slices
   ═══════════════════════════════════════════════════════ */

import { create } from "zustand";
import { createCollaborationSlice } from "./slices/collaboration-slice";
import { createGitDataSlice } from "./slices/git-data-slice";
import { createRebaseBisectSlice } from "./slices/rebase-bisect-slice";
import { createSearchSlice } from "./slices/search-slice";
import { createSettingsSlice } from "./slices/settings-slice";
import { createStagingSlice } from "./slices/staging-slice";
import { createTabsSlice } from "./slices/tabs-slice";
import { createWorktreeSubmoduleSlice } from "./slices/worktree-submodule-slice";
import { INITIAL_LOADING_STATES, type RepoState } from "./types";

/**
 * Merge the slices, refusing to let two of them claim the same key.
 *
 * Slices are composed by spread, so a later slice silently wins any key an
 * earlier one also defines — and TypeScript permits it, because merging two
 * interfaces that declare the same property with the same type is legal. That
 * combination previously hid three whole duplicated slices, one of which
 * shadowed the `refreshGeneration` stale-write guard with a version that did
 * not have it. Nothing static catches this, so check at assembly time.
 */
function mergeSlices(
  slices: Record<string, unknown>[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const owner = new Map<string, number>();

  slices.forEach((slice, index) => {
    for (const key of Object.keys(slice)) {
      const previous = owner.get(key);
      if (previous !== undefined) {
        throw new Error(
          `Store slice collision: "${key}" is defined by slice #${previous} and again by ` +
            `slice #${index}. The later definition would silently win. Remove the duplicate.`,
        );
      }
      owner.set(key, index);
      merged[key] = slice[key];
    }
  });

  return merged;
}

export const useRepoStore = create<RepoState>(
  (set, get, store) =>
    mergeSlices([
      // Shared loading surface, checked for collisions like any slice.
      {
        loadingStates: { ...INITIAL_LOADING_STATES },
        isLoading: false,
        isRefreshing: false,
      },
      createTabsSlice(set, get, store),
      createGitDataSlice(set, get, store),
      createStagingSlice(set, get, store),
      createCollaborationSlice(set, get, store),
      createRebaseBisectSlice(set, get, store),
      createWorktreeSubmoduleSlice(set, get, store),
      createSearchSlice(set, get, store),
      createSettingsSlice(set, get, store),
    ] as unknown as Record<string, unknown>[]) as unknown as RepoState,
);
