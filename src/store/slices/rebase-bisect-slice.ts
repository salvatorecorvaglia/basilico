import type { StateCreator } from "zustand";
import type {
  BisectState,
  RebaseStatus,
  RebaseTodoItem,
} from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { withLoading } from "../store-helpers";
import type { RepoState } from "../types";

export interface RebaseBisectSlice {
  rebaseTodoItems: RebaseTodoItem[];
  rebaseStatus: RebaseStatus | null;
  bisectState: BisectState | null;

  initRebase: (upstream: string) => Promise<void>;
  writeRebaseTodo: (items: RebaseTodoItem[]) => Promise<void>;
  stepRebase: (
    action: string,
    commitMessage?: string | null,
  ) => Promise<RebaseStatus>;
  startBisect: (bad: string, good: string) => Promise<void>;
  markBisect: (status: string) => Promise<void>;
  resetBisect: () => Promise<void>;
}

export const createRebaseBisectSlice: StateCreator<
  RepoState,
  [],
  [],
  RebaseBisectSlice
> = (set, get) => ({
  rebaseTodoItems: [],
  rebaseStatus: null,
  bisectState: null,

  initRebase: async (upstream: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to initialize rebase",
      async () => {
        const items = await commands.rebaseInit(activeTabId, upstream, {
          errorPrefix: "Failed to initialize rebase",
        });
        set({ rebaseTodoItems: items });
      },
    );
  },

  writeRebaseTodo: async (items: RebaseTodoItem[]) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to write rebase todo list",
      async () => {
        await commands.rebaseWriteTodo(activeTabId, items, {
          errorPrefix: "Failed to write rebase todo list",
        });
        set({ rebaseTodoItems: items });
      },
    );
  },

  stepRebase: async (action: string, commitMessage?: string | null) => {
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository tab");

    return await withLoading(
      get,
      set,
      "collaboration",
      "Failed to execute rebase step",
      async () => {
        const status = await commands.rebaseStep(
          activeTabId,
          action,
          commitMessage,
          { errorPrefix: "Failed to execute rebase step" },
        );
        set({ rebaseStatus: status });
        await get().refreshCommitsAndStatus();
        return status;
      },
    );
  },

  startBisect: async (bad: string, good: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to start bisect",
      async () => {
        const state = await commands.bisectStart(activeTabId, bad, good, {
          errorPrefix: "Failed to start bisect",
        });
        set({ bisectState: state });
        await get().refreshCommitsAndStatus();
      },
    );
  },

  markBisect: async (status: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to mark bisect step",
      async () => {
        const state = await commands.bisectMark(activeTabId, status, {
          errorPrefix: "Failed to mark bisect step",
        });
        set({ bisectState: state });
        await get().refreshCommitsAndStatus();
      },
    );
  },

  resetBisect: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    await withLoading(
      get,
      set,
      "collaboration",
      "Failed to reset bisect",
      async () => {
        await commands.bisectReset(activeTabId, {
          errorPrefix: "Failed to reset bisect",
        });
        set({ bisectState: null });
        await get().refreshCommitsAndStatus();
      },
    );
  },
});
