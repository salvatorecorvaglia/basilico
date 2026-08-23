import type { StateCreator } from "zustand";
import type {
  BlameLine,
  BranchInfo,
  FileDiff,
  FileHistoryEntry,
  GraphCommit,
  RemoteInfo,
  RepoInfo,
  RepoStatus,
  TagInfo,
} from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { setLoading } from "../store-helpers";
import type { RepoState } from "../types";

// The initial commit page size. A refresh must fetch at least this many, but
// if the user has scrolled further via loadMoreCommits, refetching only this
// many would silently truncate the list back down and lose their place —
// so refreshes request max(this, what's already loaded) instead.
const DEFAULT_COMMIT_PAGE_SIZE = 500;

export interface GitDataSlice {
  repoInfo: RepoInfo | null;
  status: RepoStatus | null;
  branches: BranchInfo[];
  tags: TagInfo[];
  remotes: RemoteInfo[];
  commits: GraphCommit[];
  firstParentOnly: boolean;
  hideRemoteBranches: boolean;
  pathFilter: string;
  selectedCommitOid: string | null;
  commitDiff: FileDiff[];
  blameLines: BlameLine[];
  fileHistory: FileHistoryEntry[];

  refreshGeneration: number;
  /** False once the backend has returned a short page. */
  hasMoreCommits: boolean;

  refreshStatus: () => Promise<void>;
  refreshCommitsAndStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshOnFileSystemChange: () => Promise<void>;
  selectCommit: (oid: string | null) => Promise<void>;
  loadMoreCommits: (count: number) => Promise<void>;
  setGraphFilters: (filters: {
    firstParentOnly?: boolean;
    hideRemoteBranches?: boolean;
    pathFilter?: string;
  }) => Promise<void>;
  listMergedBranches: (targetBranch?: string) => Promise<BranchInfo[]>;
  loadFileBlame: (filePath: string, commitOid?: string | null) => Promise<void>;
  loadFileHistory: (filePath: string) => Promise<void>;
}

export const createGitDataSlice: StateCreator<
  RepoState,
  [],
  [],
  GitDataSlice
> = (set, get) => ({
  repoInfo: null,
  status: null,
  branches: [],
  tags: [],
  remotes: [],
  commits: [],
  firstParentOnly: false,
  hideRemoteBranches: false,
  pathFilter: "",
  selectedCommitOid: null,
  commitDiff: [],
  blameLines: [],
  fileHistory: [],

  refreshGeneration: 0,
  hasMoreCommits: true,

  refreshStatus: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      const status = await commands.getStatus(activeTabId, { silent: true });
      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({ status });
      }
    } catch (err) {
      console.error("Failed to refresh status:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshCommitsAndStatus: async () => {
    const {
      activeTabId,
      refreshGeneration,
      firstParentOnly,
      hideRemoteBranches,
      pathFilter,
      commits: loadedCommits,
    } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      const [status, commits] = await Promise.all([
        commands.getStatus(activeTabId, { silent: true }),
        commands.getLog(
          activeTabId,
          Math.max(DEFAULT_COMMIT_PAGE_SIZE, loadedCommits.length),
          firstParentOnly,
          hideRemoteBranches,
          pathFilter,
          { silent: true },
        ),
      ]);
      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({ status, commits, hasMoreCommits: true });
      }
    } catch (err) {
      console.error("Failed to refresh commits and status:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshBranches: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    set({ error: null });
    try {
      const [branches, tags] = await Promise.all([
        commands.listBranches(activeTabId, { silent: true }),
        commands.listTags(activeTabId, { silent: true }),
      ]);
      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({ branches, tags });
      }
    } catch (err) {
      console.error("Failed to refresh branches:", err);
      set({ error: String(err) });
      throw err;
    }
  },

  refreshAll: async () => {
    const {
      activeTabId,
      refreshGeneration,
      firstParentOnly,
      hideRemoteBranches,
      pathFilter,
      commits: loadedCommits,
    } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      const safeCall = async <T>(
        promise: Promise<T>,
        fallback: T,
      ): Promise<T> => {
        try {
          return await promise;
        } catch (e) {
          console.warn("Secondary refresh call failed:", e);
          return fallback;
        }
      };

      const [status, branches, tags, remotes, commits, stashes, repoInfo] =
        await Promise.all([
          commands.getStatus(activeTabId, { silent: true }),
          commands.listBranches(activeTabId, { silent: true }),
          safeCall(commands.listTags(activeTabId, { silent: true }), []),
          safeCall(commands.listRemotes(activeTabId, { silent: true }), []),
          commands.getLog(
            activeTabId,
            Math.max(DEFAULT_COMMIT_PAGE_SIZE, loadedCommits.length),
            firstParentOnly,
            hideRemoteBranches,
            pathFilter,
            { silent: true },
          ),
          safeCall(commands.listStashes(activeTabId, { silent: true }), []),
          commands.getRepoInfo(activeTabId, { silent: true }),
        ]);

      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({
          status,
          branches,
          tags,
          remotes,
          commits,
          stashes,
          repoInfo,
          hasMoreCommits: true,
        });

        // Load worktrees and submodules in background (non-blocking)
        commands
          .listWorktrees(activeTabId, { silent: true })
          .then((worktrees) => {
            if (get().refreshGeneration === refreshGeneration) {
              set({ worktrees });
            }
          })
          .catch(() => set({ worktrees: [] }));
        commands
          .listSubmodules(activeTabId, { silent: true })
          .then((submodules) => {
            if (get().refreshGeneration === refreshGeneration) {
              set({ submodules });
            }
          })
          .catch(() => set({ submodules: [] }));
      }
    } catch (err) {
      console.error("Failed to refresh:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshOnFileSystemChange: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      // Only refresh status + branches on filesystem change, NOT the full commit log.
      // The commit log is expensive (500 commits + graph layout) and doesn't change on file saves.
      // Include branches so CLI-created/deleted branches are reflected in the sidebar.
      const [status, branches, tags] = await Promise.all([
        commands.getStatus(activeTabId, { silent: true }),
        commands.listBranches(activeTabId, { silent: true }),
        commands.listTags(activeTabId, { silent: true }),
      ]);
      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({ status, branches, tags });
      }
    } catch (err) {
      console.error("Failed to refresh on file change:", err);
      set({ error: String(err) });
    } finally {
      set({ isRefreshing: false });
    }
  },

  selectCommit: async (oid: string | null) => {
    set({ selectedCommitOid: oid, commitDiff: [], error: null });

    if (!oid) return;

    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    setLoading(get, set, "diff", true);
    try {
      const diff = await commands.getCommitDiff(activeTabId, oid, {
        silent: true,
      });
      // Guard: only apply if still the same tab and this commit is still selected
      if (
        get().refreshGeneration === refreshGeneration &&
        get().selectedCommitOid === oid
      ) {
        set({ commitDiff: diff });
      }
    } catch (err) {
      console.error("Failed to load commit diff:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "diff", false);
    }
  },

  loadMoreCommits: async (count: number) => {
    const {
      activeTabId,
      commits,
      loadingStates,
      firstParentOnly,
      hideRemoteBranches,
      pathFilter,
      refreshGeneration,
      hasMoreCommits,
    } = get();
    if (!activeTabId || loadingStates.commits || !hasMoreCommits) return;

    setLoading(get, set, "commits", true);
    set({ error: null });
    try {
      // Request only the next page. The backend still walks the preceding
      // commits to keep graph lanes aligned, but no longer re-serialises them,
      // so scrolling is linear in what is actually new rather than quadratic.
      const page = await commands.getLog(
        activeTabId,
        count,
        firstParentOnly,
        hideRemoteBranches,
        pathFilter,
        { silent: true },
        commits.length,
      );

      // Guard: a tab switch during the fetch must not paste this tab's commits
      // over the newly active one.
      if (get().refreshGeneration !== refreshGeneration) return;

      if (page.length === 0) {
        set({ hasMoreCommits: false });
        return;
      }

      // Defensive de-duplication: if the history changed underneath us the
      // page boundary can overlap, and duplicate keys would break the list.
      const seen = new Set(get().commits.map((c) => c.oid));
      const fresh = page.filter((c) => !seen.has(c.oid));

      set({
        commits: [...get().commits, ...fresh],
        hasMoreCommits: page.length >= count,
      });
    } catch (err) {
      console.error("Failed to load more commits:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "commits", false);
    }
  },

  setGraphFilters: async (filters) => {
    set({
      firstParentOnly: filters.firstParentOnly ?? get().firstParentOnly,
      hideRemoteBranches:
        filters.hideRemoteBranches ?? get().hideRemoteBranches,
      pathFilter: filters.pathFilter ?? get().pathFilter,
    });
    await get().refreshCommitsAndStatus();
  },

  listMergedBranches: async (targetBranch) => {
    const { activeTabId } = get();
    if (!activeTabId) return [];
    try {
      return await commands.listMergedBranches(activeTabId, targetBranch, {
        errorPrefix: "Failed to detect merged branches",
      });
    } catch (err) {
      console.error("Failed to list merged branches:", err);
      set({ error: String(err) });
      return [];
    }
  },

  loadFileBlame: async (filePath, commitOid = null) => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    setLoading(get, set, "blame", true);
    set({ blameLines: [], error: null });
    try {
      const lines = await commands.getFileBlame(
        activeTabId,
        filePath,
        commitOid,
      );
      if (get().refreshGeneration === refreshGeneration) {
        set({ blameLines: lines });
      }
    } catch (err) {
      console.error("Failed to load file blame:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "blame", false);
    }
  },

  loadFileHistory: async (filePath) => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    setLoading(get, set, "history", true);
    set({ fileHistory: [], error: null });
    try {
      const history = await commands.getFileHistory(activeTabId, filePath);
      if (get().refreshGeneration === refreshGeneration) {
        set({ fileHistory: history });
      }
    } catch (err) {
      console.error("Failed to load file history:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "history", false);
    }
  },
});
