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
  /** Upstream the pending plan was built against; needed to start the rebase. */
  rebaseUpstream: string | null;
  bisectState: BisectState | null;

  initRebase: (upstream: string) => Promise<void>;
  writeRebaseTodo: (items: RebaseTodoItem[]) => Promise<void>;
  startRebase: () => Promise<RebaseStatus>;
  stepRebase: (
    action: string,
    commitMessage?: string | null,
  ) => Promise<RebaseStatus>;
  startBisect: (bad: string, good: string) => Promise<void>;
  markBisect: (status: string) => Promise<void>;
  resetBisect: () => Promise<void>;
}

/** Debounce window for persisting the in-progress rebase plan to disk. */
const PLAN_PERSIST_DELAY_MS = 400;
let planPersistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePlanPersist(repoPath: string, items: RebaseTodoItem[]) {
  if (planPersistTimer) clearTimeout(planPersistTimer);
  planPersistTimer = setTimeout(() => {
    planPersistTimer = null;
    commands
      .rebaseWriteTodo(repoPath, items, { silent: true })
      .catch((err) => console.warn("Failed to persist rebase plan:", err));
  }, PLAN_PERSIST_DELAY_MS);
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

  writeRebaseTodo: async (items: RebaseTodoItem[]) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    // Applied optimistically: editing the plan is a local action and must stay
    // responsive. Persistence is debounced because inline message editing fires
    // this on every keystroke, and it is best-effort — the plan that matters is
    // the one handed to `rebase_start`.
    set({ rebaseTodoItems: items });
    schedulePlanPersist(activeTabId, items);
  },

  startRebase: async () => {
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
      async () => {
        const status = await commands.rebaseStart(
          activeTabId,
          rebaseUpstream,
          rebaseTodoItems,
          { errorPrefix: "Failed to start rebase" },
        );
        set({ rebaseStatus: status });
        await get().refreshCommitsAndStatus();
        return status;
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
        if (status.status === "finished" || status.status === "none") {
          set({ rebaseTodoItems: [], rebaseUpstream: null });
        }
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
