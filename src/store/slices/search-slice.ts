import type { StateCreator } from "zustand";
import type { GraphCommit, GrepMatch } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { beginLoading, beginRequest } from "../store-helpers";
import type { RepoState } from "../types";

export interface SearchSlice {
  commitSearchResults: GraphCommit[];
  grepSearchResults: GrepMatch[];

  clearSearchResults: () => void;
  searchCommits: (query: string) => Promise<void>;
  grepCode: (query: string) => Promise<void>;
}

export const createSearchSlice: StateCreator<RepoState, [], [], SearchSlice> = (
  set,
  get,
) => ({
  commitSearchResults: [],
  grepSearchResults: [],
  clearSearchResults: () => {
    beginRequest(get, "commitSearchResults");
    beginRequest(get, "grepSearchResults");
    set({ commitSearchResults: [], grepSearchResults: [] });
  },

  // Both actions capture `refreshGeneration` and re-check it before writing.
  // `switchTab`/`closeTab` bump the generation, so a response that arrives
  // after the user has moved to another repository is discarded instead of
  // populating the store with another tab's results.
  searchCommits: async (query: string) => {
    const request = beginRequest(get, "commitSearchResults");
    const { activeTabId } = get();
    if (!activeTabId || !query.trim()) {
      set({ commitSearchResults: [] });
      return;
    }

    const finishLoading = beginLoading(get, set, "search");
    try {
      const results = await commands.searchCommits(activeTabId, query, {
        silent: true,
      });
      if (request.isCurrent()) {
        set({ commitSearchResults: results });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      throw err;
    } finally {
      finishLoading();
    }
  },

  grepCode: async (query: string) => {
    const request = beginRequest(get, "grepSearchResults");
    const { activeTabId } = get();
    if (!activeTabId || !query.trim()) {
      set({ grepSearchResults: [] });
      return;
    }

    const finishLoading = beginLoading(get, set, "search");
    try {
      const results = await commands.grepCode(activeTabId, query, {
        silent: true,
      });
      if (request.isCurrent()) {
        set({ grepSearchResults: results });
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      throw err;
    } finally {
      finishLoading();
    }
  },
});
