import type { StateCreator } from "zustand";
import type {
  BlameLine,
  BranchInfo,
  FileDiff,
  FileHistoryEntry,
  GraphCommit,
  GrepMatch,
  ReflogEntryInfo,
  RemoteInfo,
  RepoInfo,
  RepoStatus,
  TagInfo,
} from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import { setLoading } from "../store-helpers";
import type { RepoState } from "../types";

export interface GitDataSlice {
  repoInfo: RepoInfo | null;
  status: RepoStatus | null;
  branches: BranchInfo[];
  tags: TagInfo[];
  remotes: RemoteInfo[];
  commits: GraphCommit[];
  selectedCommitOid: string | null;
  commitDiff: FileDiff[];
  blameLines: BlameLine[];
  fileHistory: FileHistoryEntry[];
  commitSearchResults: GraphCommit[];
  grepSearchResults: GrepMatch[];
  reflogEntries: ReflogEntryInfo[];

  refreshGeneration: number;

  refreshStatus: () => Promise<void>;
  refreshCommitsAndStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshOnFileSystemChange: () => Promise<void>;
  selectCommit: (oid: string | null) => Promise<void>;
  loadMoreCommits: (count: number) => Promise<void>;
  loadFileBlame: (filePath: string, commitOid?: string | null) => Promise<void>;
  loadFileHistory: (filePath: string) => Promise<void>;
  loadReflog: () => Promise<void>;
  searchCommits: (query: string) => Promise<void>;
  grepCode: (query: string) => Promise<void>;
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
  selectedCommitOid: null,
  commitDiff: [],
  blameLines: [],
  fileHistory: [],
  commitSearchResults: [],
  grepSearchResults: [],
  reflogEntries: [],

  refreshGeneration: 0,

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
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      const [status, commits] = await Promise.all([
        commands.getStatus(activeTabId, { silent: true }),
        commands.getLog(activeTabId, 500, { silent: true }),
      ]);
      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({ status, commits });
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
    const { activeTabId, refreshGeneration } = get();
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
          commands.getLog(activeTabId, 500, { silent: true }),
          safeCall(commands.listStashes(activeTabId, { silent: true }), []),
          commands.getRepoInfo(activeTabId, { silent: true }),
        ]);

      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
        set({ status, branches, tags, remotes, commits, stashes, repoInfo });

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
      // Guard: only apply if still the same tab
      if (get().refreshGeneration === refreshGeneration) {
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
    const { activeTabId, commits, loadingStates } = get();
    if (!activeTabId || loadingStates.commits) return;

    setLoading(get, set, "commits", true);
    set({ error: null });
    try {
      const moreCommits = await commands.getLog(
        activeTabId,
        commits.length + count,
        { silent: true },
      );
      set({ commits: moreCommits });
    } catch (err) {
      console.error("Failed to load more commits:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "commits", false);
    }
  },

  loadFileBlame: async (filePath, commitOid = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "blame", true);
    set({ blameLines: [], error: null });
    try {
      const lines = await commands.getFileBlame(
        activeTabId,
        filePath,
        commitOid,
      );
      set({ blameLines: lines });
    } catch (err) {
      console.error("Failed to load file blame:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "blame", false);
    }
  },

  loadFileHistory: async (filePath) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    setLoading(get, set, "history", true);
    set({ fileHistory: [], error: null });
    try {
      const history = await commands.getFileHistory(activeTabId, filePath);
      set({ fileHistory: history });
    } catch (err) {
      console.error("Failed to load file history:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "history", false);
    }
  },

  searchCommits: async (query) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    if (!query.trim()) {
      set({ commitSearchResults: [] });
      return;
    }

    setLoading(get, set, "search", true);
    set({ error: null });
    try {
      const results = await commands.searchCommits(activeTabId, query, {
        errorPrefix: "Failed to search commits",
      });
      set({ commitSearchResults: results });
    } catch (err) {
      console.error("Failed to search commits:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "search", false);
    }
  },

  grepCode: async (query) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    if (!query.trim()) {
      set({ grepSearchResults: [] });
      return;
    }

    setLoading(get, set, "search", true);
    set({ error: null });
    try {
      const results = await commands.grepCode(activeTabId, query, {
        errorPrefix: "Failed to search code",
      });
      set({ grepSearchResults: results });
    } catch (err) {
      console.error("Failed to grep code:", err);
      set({ error: String(err) });
      throw err;
    } finally {
      setLoading(get, set, "search", false);
    }
  },

  loadReflog: async () => {
    const { activeTabId, refreshGeneration } = get();
    if (!activeTabId) return;

    setLoading(get, set, "history", true);
    set({ error: null });
    try {
      const entries = await commands.getReflog(activeTabId, {
        errorPrefix: "Failed to load reflog",
      });
      if (get().refreshGeneration === refreshGeneration) {
        set({ reflogEntries: entries });
      }
    } catch (err) {
      console.error("Failed to load reflog:", err);
      set({ error: String(err) });
    } finally {
      setLoading(get, set, "history", false);
    }
  },
});
