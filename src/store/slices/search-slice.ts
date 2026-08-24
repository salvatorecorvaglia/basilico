import type { StateCreator } from "zustand";
import type { GraphCommit, GrepMatch } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { setLoading } from "../store-helpers";
import type { RepoState } from "../types";

export interface SearchSlice {
  commitSearchResults: GraphCommit[];
  grepSearchResults: GrepMatch[];

  searchCommits: (query: string) => Promise<void>;
  grepCode: (query: string) => Promise<void>;
}

export const createSearchSlice: StateCreator<RepoState, [], [], SearchSlice> = (
  set,
  get,
) => ({
  commitSearchResults: [],
  grepSearchResults: [],

  // Both actions capture `refreshGeneration` and re-check it before writing.
  // `switchTab`/`closeTab` bump the generation, so a response that arrives
  // after the user has moved to another repository is discarded instead of
  // populating the store with another tab's results.
  searchCommits: async (query: string) => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId || !query.trim()) {
      set({ commitSearchResults: [] });
      return;
    }

    setLoading(get, set, "search", true);
    try {
      const results = await commands.searchCommits(activeTabId, query, {
        errorPrefix: "Failed to search commits",
      });
      if (get().refreshGeneration === refreshGeneration) {
        set({ commitSearchResults: results });
      }
    } catch (err) {
      console.error("Failed to search commits:", err);
    } finally {
      setLoading(get, set, "search", false);
    }
  },

  grepCode: async (query: string) => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId || !query.trim()) {
      set({ grepSearchResults: [] });
      return;
    }

    setLoading(get, set, "search", true);
    try {
      const results = await commands.grepCode(activeTabId, query, {
        errorPrefix: "Failed to search code",
      });
      if (get().refreshGeneration === refreshGeneration) {
        set({ grepSearchResults: results });
      }
    } catch (err) {
      console.error("Failed to grep code:", err);
    } finally {
      setLoading(get, set, "search", false);
    }
  },
});
