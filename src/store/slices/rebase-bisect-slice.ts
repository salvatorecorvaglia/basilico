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

/**
 * One pending write per repository.
 *
 * This was a single module-level handle shared by every repository, so editing
 * a rebase plan in one tab cancelled a pending write for another — the second
 * repository's plan was simply never persisted. Keying by path makes the
 * debounce per-repository, which is the scope it was always meant to have.
 */
const planPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePlanPersist(repoPath: string, items: RebaseTodoItem[]) {
  const pending = planPersistTimers.get(repoPath);
  if (pending) clearTimeout(pending);

  planPersistTimers.set(
    repoPath,
    setTimeout(() => {
      planPersistTimers.delete(repoPath);
      commands
        .rebaseWriteTodo(repoPath, items, { silent: true })
        .catch((err) => console.warn("Failed to persist rebase plan:", err));
    }, PLAN_PERSIST_DELAY_MS),
  );
}

/**
 * Drop any pending plan write for a repository.
 *
 * Called when a rebase concludes, so a debounced write cannot land against a
 * repository whose rebase has already finished or been aborted.
 */
export function cancelPlanPersist(repoPath: string) {
  const pending = planPersistTimers.get(repoPath);
  if (pending) {
    clearTimeout(pending);
    planPersistTimers.delete(repoPath);
  }
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
        // The plan is being handed to git now, so any debounced write of it is
        // redundant at best and, once the rebase rewrites history, stale.
        cancelPlanPersist(activeTabId);
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
          cancelPlanPersist(activeTabId);
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
