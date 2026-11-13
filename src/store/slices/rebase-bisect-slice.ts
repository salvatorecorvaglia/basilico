import type { StateCreator } from "zustand";
import type {
  BisectState,
  RebaseStatus,
  RebaseTodoItem,
} from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { beginRequest, withActiveRepo, withLoading } from "../store-helpers";
import type { RepoState } from "../types";

export interface RebaseBisectSlice {
  rebaseTodoItems: RebaseTodoItem[];
  rebaseStatus: RebaseStatus | null;
  /** Upstream the pending plan was built against; needed to start the rebase. */
  rebaseUpstream: string | null;
  bisectState: BisectState | null;

  initRebase: (upstream: string) => Promise<void>;
  /** Replace the plan being edited. Local only: git sees it at `startRebase`. */
  setRebaseTodoItems: (items: RebaseTodoItem[]) => void;
  startRebase: () => Promise<RebaseStatus>;
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
  rebaseUpstream: null,
  bisectState: null,

  initRebase: async (upstream: string) => {
    const request = beginRequest(get, "rebaseStatus");
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to initialize rebase",
      async (activeTabId, context) => {
        const items = await commands.rebaseInit(activeTabId, upstream, {
          errorPrefix: "Failed to initialize rebase",
        });
        if (!context.isCurrent() || !request.isCurrent()) return;

        // The repository is untouched at this point: the plan is only staged
        // in the UI, so closing the editor cannot strand a half-started rebase.
        set({
          rebaseTodoItems: items,
          rebaseUpstream: upstream,
          rebaseStatus: {
            status: "planning",
            currentOid: null,
            message: "Arrange your commits, then start the rebase.",
          },
        });
      },
    );
  },

  setRebaseTodoItems: (items: RebaseTodoItem[]) => {
    // Editing the plan is purely local. It used to be written to a JSON file
    // in `.git/` after every edit (debounced, per keystroke of an inline
    // message edit), but nothing ever read that file back — the plan that
    // matters is the one handed to `rebase_start`.
    set({ rebaseTodoItems: items });
  },

  startRebase: async () => {
    const request = beginRequest(get, "rebaseStatus");
    const { activeTabId, rebaseTodoItems, rebaseUpstream } = get();
    if (!activeTabId) throw new Error("No active repository tab");
    if (!rebaseUpstream) {
      throw new Error("No rebase plan has been prepared");
    }

    return await withLoading(
      get,
      set,
      "collaboration",
      "Failed to start rebase",
      async (context) => {
        const status = await commands.rebaseStart(
          activeTabId,
          rebaseUpstream,
          rebaseTodoItems,
          { errorPrefix: "Failed to start rebase" },
        );
        if (!context.isCurrent() || !request.isCurrent()) return status;

        set({ rebaseStatus: status });
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent() || !request.isCurrent()) return status;

        return status;
      },
    );
  },

  stepRebase: async (action: string, commitMessage?: string | null) => {
    const request = beginRequest(get, "rebaseStatus");
    const { activeTabId } = get();
    if (!activeTabId) throw new Error("No active repository tab");

    return await withLoading(
      get,
      set,
      "collaboration",
      "Failed to execute rebase step",
      async (context) => {
        const status = await commands.rebaseStep(
          activeTabId,
          action,
          commitMessage,
          { errorPrefix: "Failed to execute rebase step" },
        );
        if (!context.isCurrent() || !request.isCurrent()) return status;

        set({ rebaseStatus: status });
        if (status.status === "finished" || status.status === "none") {
          set({ rebaseTodoItems: [], rebaseUpstream: null });
        }
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent() || !request.isCurrent()) return status;

        return status;
      },
    );
  },

  startBisect: async (bad: string, good: string) => {
    const request = beginRequest(get, "bisectState");
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to start bisect",
      async (activeTabId, context) => {
        const state = await commands.bisectStart(activeTabId, bad, good, {
          errorPrefix: "Failed to start bisect",
        });
        if (!context.isCurrent() || !request.isCurrent()) return;

        set({ bisectState: state });
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent() || !request.isCurrent()) return;
      },
    );
  },

  markBisect: async (status: string) => {
    const request = beginRequest(get, "bisectState");
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to mark bisect step",
      async (activeTabId, context) => {
        const state = await commands.bisectMark(activeTabId, status, {
          errorPrefix: "Failed to mark bisect step",
        });
        if (!context.isCurrent() || !request.isCurrent()) return;

        set({ bisectState: state });
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent() || !request.isCurrent()) return;
      },
    );
  },

  resetBisect: async () => {
    const request = beginRequest(get, "bisectState");
    await withActiveRepo(
      get,
      set,
      "collaboration",
      "Failed to reset bisect",
      async (activeTabId, context) => {
        await commands.bisectReset(activeTabId, {
          errorPrefix: "Failed to reset bisect",
        });
        if (!context.isCurrent() || !request.isCurrent()) return;

        set({ bisectState: null });
        await get().refreshCommitsAndStatus();
        if (!context.isCurrent() || !request.isCurrent()) return;
      },
    );
  },
});
