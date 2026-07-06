import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock tauri-commands before importing the store
vi.mock("../../lib/tauri-commands", () => ({
  openRepo: vi.fn(),
  closeRepo: vi.fn(),
  getStatus: vi.fn(),
  getLog: vi.fn(),
  listBranches: vi.fn(),
  listTags: vi.fn(),
  listRemotes: vi.fn(),
  listStashes: vi.fn(),
  getWorkdirDiff: vi.fn(),
  getStagedDiff: vi.fn(),
  listWorktrees: vi.fn(),
  listSubmodules: vi.fn(),
  getRepoInfo: vi.fn(),
}));

// Mock ui-store to prevent notification issues
vi.mock("../../store/ui-store", () => ({
  useUIStore: {
    getState: () => ({
      addNotification: vi.fn(),
    }),
  },
}));

import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../repo-store";

describe("tabs-slice", () => {
  beforeEach(() => {
    // Reset store state between tests
    useRepoStore.setState({
      tabs: [],
      activeTabId: null,
      isLoading: false,
      error: null,
      errors: {},
      branches: [],
      tags: [],
      remotes: [],
      stashes: [],
      commits: [],
      worktrees: [],
      submodules: [],
      refreshGeneration: 0,
    });
    vi.clearAllMocks();
  });

  describe("openRepository", () => {
    it("should open a repository and set active tab", async () => {
      const mockRepoInfo = {
        path: "/test/repo",
        name: "repo",
        isHeadDetached: false,
        headOid: "abc123",
        defaultBranch: "main",
      };
      (commands.openRepo as any).mockResolvedValue(mockRepoInfo);
      (commands.getStatus as any).mockResolvedValue({
        branch: "main",
        files: [],
      });
      (commands.getLog as any).mockResolvedValue([]);
      (commands.listBranches as any).mockResolvedValue([]);
      (commands.listTags as any).mockResolvedValue([]);
      (commands.listRemotes as any).mockResolvedValue([]);
      (commands.listStashes as any).mockResolvedValue([]);
      (commands.getWorkdirDiff as any).mockResolvedValue([]);
      (commands.getStagedDiff as any).mockResolvedValue([]);
      (commands.listWorktrees as any).mockResolvedValue([]);
      (commands.listSubmodules as any).mockResolvedValue([]);
      (commands.getRepoInfo as any).mockResolvedValue(mockRepoInfo);

      await useRepoStore.getState().openRepository("/test/repo");

      const state = useRepoStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.activeTabId).toBe("/test/repo");
      expect(state.repoInfo).toEqual(mockRepoInfo);
    });

    it("Should not create duplicate tabs for concurrent opens", async () => {
      const mockRepoInfo = {
        path: "/test/repo",
        name: "repo",
        isHeadDetached: false,
        headOid: "abc123",
        defaultBranch: "main",
      };
      (commands.openRepo as any).mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(mockRepoInfo), 50)),
      );
      (commands.getStatus as any).mockResolvedValue({
        branch: "main",
        files: [],
      });
      (commands.getLog as any).mockResolvedValue([]);
      (commands.listBranches as any).mockResolvedValue([]);
      (commands.listTags as any).mockResolvedValue([]);
      (commands.listRemotes as any).mockResolvedValue([]);
      (commands.listStashes as any).mockResolvedValue([]);
      (commands.getWorkdirDiff as any).mockResolvedValue([]);
      (commands.getStagedDiff as any).mockResolvedValue([]);
      (commands.listWorktrees as any).mockResolvedValue([]);
      (commands.listSubmodules as any).mockResolvedValue([]);
      (commands.getRepoInfo as any).mockResolvedValue(mockRepoInfo);

      // Fire two concurrent opens
      const p1 = useRepoStore.getState().openRepository("/test/repo");
      const p2 = useRepoStore.getState().openRepository("/test/repo");

      await Promise.allSettled([p1, p2]);

      // openRepo should only be called once due to the deduplication guard
      expect(commands.openRepo).toHaveBeenCalledTimes(1);
    });
  });

  describe("closeTab", () => {
    it("should remove tab and reset state when closing active tab", async () => {
      const mockRepoInfo = {
        path: "/test/repo",
        name: "repo",
        isHeadDetached: false,
        headOid: "abc123",
        defaultBranch: "main",
      };

      // Set up initial state with one tab
      useRepoStore.setState({
        tabs: [
          { id: "/test/repo", path: "/test/repo", name: "repo", isActive: true },
        ],
        activeTabId: "/test/repo",
        repoInfo: mockRepoInfo as any,
        selectedCommitOid: "abc123",
      });

      (commands.closeRepo as any).mockResolvedValue(undefined);

      useRepoStore.getState().closeTab("/test/repo");

      const state = useRepoStore.getState();
      expect(state.tabs.length).toBe(0);
      expect(state.activeTabId).toBeNull();
      expect(state.repoInfo).toBeNull();
      expect(state.selectedCommitOid).toBeNull();
    });
  });

  describe("switchTab", () => {
    it("should increment refreshGeneration when switching tabs", () => {
      useRepoStore.setState({
        tabs: [
          {
            id: "/repo1",
            path: "/repo1",
            name: "repo1",
            isActive: true,
          },
          {
            id: "/repo2",
            path: "/repo2",
            name: "repo2",
            isActive: false,
          },
        ],
        activeTabId: "/repo1",
        refreshGeneration: 5,
      });

      // Mock refreshAll to prevent actual command calls
      const mockRepoInfo = { path: "/repo2", name: "repo2", isHeadDetached: false, headOid: "abc", defaultBranch: "main" };
      (commands.getStatus as any).mockResolvedValue({
        branch: "main",
        files: [],
      });
      (commands.getLog as any).mockResolvedValue([]);
      (commands.listBranches as any).mockResolvedValue([]);
      (commands.listTags as any).mockResolvedValue([]);
      (commands.listRemotes as any).mockResolvedValue([]);
      (commands.listStashes as any).mockResolvedValue([]);
      (commands.getWorkdirDiff as any).mockResolvedValue([]);
      (commands.getStagedDiff as any).mockResolvedValue([]);
      (commands.listWorktrees as any).mockResolvedValue([]);
      (commands.listSubmodules as any).mockResolvedValue([]);
      (commands.getRepoInfo as any).mockResolvedValue(mockRepoInfo);

      useRepoStore.getState().switchTab("/repo2");

      const state = useRepoStore.getState();
      expect(state.activeTabId).toBe("/repo2");
      expect(state.refreshGeneration).toBe(6);
      expect(state.errors).toEqual({});
    });
  });
});
