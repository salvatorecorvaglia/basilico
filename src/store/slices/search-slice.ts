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

  searchCommits: async (query: string) => {
    const { activeTabId } = get();
    if (!activeTabId || !query.trim()) {
      set({ commitSearchResults: [] });
      return;
    }

    setLoading(get, set, "search", true);
    set({ error: null });
    try {
      const results = await commands.searchCommits(activeTabId, query, {
        silent: true,
      });
      set({ commitSearchResults: results });
    } catch (err) {
      console.error("Failed to search commits:", err);
      set({ error: String(err) });
    } finally {
      setLoading(get, set, "search", false);
    }
  },

  grepCode: async (query: string) => {
    const { activeTabId } = get();
    if (!activeTabId || !query.trim()) {
      set({ grepSearchResults: [] });
      return;
    }

    setLoading(get, set, "search", true);
    set({ error: null });
    try {
      const results = await commands.grepCode(activeTabId, query, {
        silent: true,
      });
      set({ grepSearchResults: results });
    } catch (err) {
      console.error("Failed to grep code:", err);
      set({ error: String(err) });
    } finally {
      setLoading(get, set, "search", false);
    }
  },
});
