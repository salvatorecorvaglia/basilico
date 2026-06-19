/* ═══════════════════════════════════════════════════════
   Basilico — Repository Store
   Per-tab repository state management
   ═══════════════════════════════════════════════════════ */

import { create } from 'zustand';
import type {
  RepoTab,
  RepoInfo,
  RepoStatus,
  BranchInfo,
  TagInfo,
  RemoteInfo,
  GraphCommit,
  FileDiff,
} from '../lib/git-types';
import * as commands from '../lib/tauri-commands';

interface RepoState {
  // Tabs
  tabs: RepoTab[];
  activeTabId: string | null;

  // Active repo data
  repoInfo: RepoInfo | null;
  status: RepoStatus | null;
  branches: BranchInfo[];
  tags: TagInfo[];
  remotes: RemoteInfo[];
  commits: GraphCommit[];

  // Selected commit
  selectedCommitOid: string | null;
  commitDiff: FileDiff[];

  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Actions
  openRepository: (path: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  refreshStatus: () => Promise<void>;
  refreshAll: () => Promise<void>;
  selectCommit: (oid: string | null) => Promise<void>;
  loadMoreCommits: (count: number) => Promise<void>;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  // Initial state
  tabs: [],
  activeTabId: null,
  repoInfo: null,
  status: null,
  branches: [],
  tags: [],
  remotes: [],
  commits: [],
  selectedCommitOid: null,
  commitDiff: [],
  isLoading: false,
  isRefreshing: false,
  error: null,

  openRepository: async (path: string) => {
    set({ isLoading: true, error: null });

    try {
      const info = await commands.openRepo(path);

      const tabId = info.path;
      const existingTab = get().tabs.find((t) => t.id === tabId);

      if (existingTab) {
        // Switch to existing tab
        set({ activeTabId: tabId });
        await get().refreshAll();
      } else {
        // Create new tab
        const newTab: RepoTab = {
          id: tabId,
          path: info.path,
          name: info.name,
          isActive: true,
        };

        set((state) => ({
          tabs: [
            ...state.tabs.map((t) => ({ ...t, isActive: false })),
            newTab,
          ],
          activeTabId: tabId,
          repoInfo: info,
        }));

        // Load all data
        await get().refreshAll();
      }
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const filtered = tabs.filter((t) => t.id !== tabId);

    if (activeTabId === tabId) {
      const newActive = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
      set({
        tabs: filtered,
        activeTabId: newActive,
        repoInfo: null,
        status: null,
        branches: [],
        tags: [],
        remotes: [],
        commits: [],
        selectedCommitOid: null,
        commitDiff: [],
      });

      // If there's a new active tab, reload its data
      if (newActive) {
        get().refreshAll();
      }
    } else {
      set({ tabs: filtered });
    }

    // Tell Rust to clean up
    commands.closeRepo(tabId).catch(() => {});
  },

  switchTab: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === tabId })),
      activeTabId: tabId,
      selectedCommitOid: null,
      commitDiff: [],
    }));

    // Reload data for the new active tab
    get().refreshAll();
  },

  refreshStatus: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true });
    try {
      const status = await commands.getStatus(activeTabId);
      set({ status });
    } catch (err) {
      console.error('Failed to refresh status:', err);
    } finally {
      set({ isRefreshing: false });
    }
  },

  refreshAll: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set({ isRefreshing: true });
    try {
      const [status, branches, tags, remotes, commits] = await Promise.all([
        commands.getStatus(activeTabId),
        commands.listBranches(activeTabId),
        commands.listTags(activeTabId),
        commands.listRemotes(activeTabId),
        commands.getLog(activeTabId, 500),
      ]);

      set({ status, branches, tags, remotes, commits });
    } catch (err) {
      console.error('Failed to refresh:', err);
      set({ error: String(err) });
    } finally {
      set({ isRefreshing: false });
    }
  },

  selectCommit: async (oid: string | null) => {
    set({ selectedCommitOid: oid, commitDiff: [] });

    if (!oid) return;

    const { activeTabId } = get();
    if (!activeTabId) return;

    try {
      const diff = await commands.getCommitDiff(activeTabId, oid);
      set({ commitDiff: diff });
    } catch (err) {
      console.error('Failed to load commit diff:', err);
    }
  },

  loadMoreCommits: async (count: number) => {
    const { activeTabId, commits } = get();
    if (!activeTabId) return;

    try {
      const moreCommits = await commands.getLog(activeTabId, commits.length + count);
      set({ commits: moreCommits });
    } catch (err) {
      console.error('Failed to load more commits:', err);
    }
  },
}));
