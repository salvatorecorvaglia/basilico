import type { StateCreator } from 'zustand';
import type { RepoState } from '../types';
import type {
  RepoInfo,
  RepoStatus,
  BranchInfo,
  TagInfo,
  RemoteInfo,
  GraphCommit,
  FileDiff,
  BlameLine,
  FileHistoryEntry,
  ReflogEntry,
  GrepMatch,
} from '../../lib/git-types';
import * as commands from '../../lib/tauri-commands';

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
  reflogEntries: ReflogEntry[];
  commitSearchResults: GraphCommit[];
  grepSearchResults: GrepMatch[];

  refreshStatus: () => Promise<void>;
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

export const createGitDataSlice: StateCreator<RepoState, [], [], GitDataSlice> = (set, get) => ({
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
  reflogEntries: [],
  commitSearchResults: [],
  grepSearchResults: [],

  refreshStatus: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      const status = await commands.getStatus(activeTabId, { silent: true });
      set({ status });
    } catch (err) {
      console.error('Failed to refresh status:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshAll: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      const [status, branches, tags, remotes, commits, stashes, repoInfo] = await Promise.all([
        commands.getStatus(activeTabId, { silent: true }),
        commands.listBranches(activeTabId, { silent: true }),
        commands.listTags(activeTabId, { silent: true }),
        commands.listRemotes(activeTabId, { silent: true }),
        commands.getLog(activeTabId, 500, { silent: true }),
        commands.listStashes(activeTabId, { silent: true }),
        commands.openRepo(activeTabId, { silent: true }),
      ]);

      set({ status, branches, tags, remotes, commits, stashes, repoInfo });

      // Load worktrees and submodules in background (non-blocking)
      commands.listWorktrees(activeTabId, { silent: true })
        .then(worktrees => set({ worktrees }))
        .catch(() => set({ worktrees: [] }));
      commands.listSubmodules(activeTabId, { silent: true })
        .then(submodules => set({ submodules }))
        .catch(() => set({ submodules: [] }));
    } catch (err) {
      console.error('Failed to refresh:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshOnFileSystemChange: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true, error: null });
    try {
      const [status, commits] = await Promise.all([
        commands.getStatus(activeTabId, { silent: true }),
        commands.getLog(activeTabId, 500, { silent: true }),
      ]);
      set({ status, commits });
    } catch (err) {
      console.error('Failed to refresh on file change:', err);
      set({ error: String(err) });
    } finally {
      set({ isRefreshing: false });
    }
  },

  selectCommit: async (oid: string | null) => {
    set({ selectedCommitOid: oid, commitDiff: [], error: null });

    if (!oid) return;

    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true });
    try {
      const diff = await commands.getCommitDiff(activeTabId, oid, { silent: true });
      set({ commitDiff: diff });
    } catch (err) {
      console.error('Failed to load commit diff:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  loadMoreCommits: async (count: number) => {
    const { activeTabId, commits } = get();
    if (!activeTabId) return;

    set({ isLoading: true, error: null });
    try {
      const moreCommits = await commands.getLog(activeTabId, commits.length + count, { silent: true });
      set({ commits: moreCommits });
    } catch (err) {
      console.error('Failed to load more commits:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  loadFileBlame: async (filePath, commitOid = null) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, blameLines: [], error: null });
    try {
      const lines = await commands.getFileBlame(activeTabId, filePath, commitOid);
      set({ blameLines: lines });
    } catch (err) {
      console.error('Failed to load file blame:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  loadFileHistory: async (filePath) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, fileHistory: [], error: null });
    try {
      const history = await commands.getFileHistory(activeTabId, filePath);
      set({ fileHistory: history });
    } catch (err) {
      console.error('Failed to load file history:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  loadReflog: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isLoading: true, reflogEntries: [], error: null });
    try {
      const entries = await commands.getReflog(activeTabId);
      set({ reflogEntries: entries });
    } catch (err) {
      console.error('Failed to load reflog:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  searchCommits: async (query) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    if (!query.trim()) {
      set({ commitSearchResults: [] });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const results = await commands.searchCommits(activeTabId, query, { errorPrefix: 'Failed to search commits' });
      set({ commitSearchResults: results });
    } catch (err) {
      console.error('Failed to search commits:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  grepCode: async (query) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    if (!query.trim()) {
      set({ grepSearchResults: [] });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const results = await commands.grepCode(activeTabId, query, { errorPrefix: 'Failed to search code' });
      set({ grepSearchResults: results });
    } catch (err) {
      console.error('Failed to grep code:', err);
      set({ error: String(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
});
