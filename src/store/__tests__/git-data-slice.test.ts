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
  getCommitDiff: vi.fn(),
  getFileBlame: vi.fn(),
  getFileHistory: vi.fn(),
  searchCommits: vi.fn(),
  grepCode: vi.fn(),
}));

import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../repo-store";

describe("git-data-slice", () => {
  beforeEach(() => {
    useRepoStore.setState({
      activeTabId: "/test/repo",
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
      refreshGeneration: 0,
      isLoading: false,
      error: null,
      errors: {},
    });
    vi.clearAllMocks();
  });

  describe("refreshStatus", () => {
    it("should fetch status and save to state if generation matches", async () => {
      const mockStatus = { branch: "main", files: [] };
      (commands.getStatus as any).mockResolvedValue(mockStatus);

      await useRepoStore.getState().refreshStatus();

      const state = useRepoStore.getState();
      expect(state.status).toEqual(mockStatus);
      expect(commands.getStatus).toHaveBeenCalledWith("/test/repo", { silent: true });
    });

    it("should ignore update if refreshGeneration has changed", async () => {
      const mockStatus = { branch: "main", files: [] };
      (commands.getStatus as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            // increment generation mid-flight
            useRepoStore.setState({ refreshGeneration: 1 });
            resolve(mockStatus);
          }),
      );

      await useRepoStore.getState().refreshStatus();

      const state = useRepoStore.getState();
      // Should not be updated since generation doesn't match
      expect(state.status).toBeNull();
    });
  });

  describe("refreshCommitsAndStatus", () => {
    it("should fetch commits and status", async () => {
      const mockStatus = { branch: "main", files: [] };
      const mockCommits = [{ oid: "123", shortOid: "123", author: "A", date: 1, message: "m", lane: 0, parents: [] }];
      (commands.getStatus as any).mockResolvedValue(mockStatus);
      (commands.getLog as any).mockResolvedValue(mockCommits);

      await useRepoStore.getState().refreshCommitsAndStatus();

      const state = useRepoStore.getState();
      expect(state.status).toEqual(mockStatus);
      expect(state.commits).toEqual(mockCommits);
    });
  });

  describe("refreshOnFileSystemChange", () => {
    it("should fetch status, branches, and tags, but NOT the commit log", async () => {
      const mockStatus = { branch: "main", files: [] };
      const mockBranches = [{ name: "main", isCurrent: true, oid: "123", upstream: null, isRemote: false }];
      const mockTags = [{ name: "v1.0.0", oid: "123", targetOid: "123" }];

      (commands.getStatus as any).mockResolvedValue(mockStatus);
      (commands.listBranches as any).mockResolvedValue(mockBranches);
      (commands.listTags as any).mockResolvedValue(mockTags);

      await useRepoStore.getState().refreshOnFileSystemChange();

      const state = useRepoStore.getState();
      expect(state.status).toEqual(mockStatus);
      expect(state.branches).toEqual(mockBranches);
      expect(state.tags).toEqual(mockTags);

      // Assert that getLog was NOT called
      expect(commands.getLog).not.toHaveBeenCalled();
    });
  });

  describe("selectCommit", () => {
    it("should update selected OID and load commit diff", async () => {
      const mockDiff = [{ path: "file.txt", oldPath: "file.txt", status: "Modified", additions: 1, deletions: 1, isBinary: false, hunks: [] }];
      (commands.getCommitDiff as any).mockResolvedValue(mockDiff);

      await useRepoStore.getState().selectCommit("abc123Oid");

      const state = useRepoStore.getState();
      expect(state.selectedCommitOid).toBe("abc123Oid");
      expect(state.commitDiff).toEqual(mockDiff);
    });
  });

  describe("loadMoreCommits", () => {
    it("should query next page of commits", async () => {
      useRepoStore.setState({ commits: [{} as any] });
      const mockCommits = [{}, {}];
      (commands.getLog as any).mockResolvedValue(mockCommits);

      await useRepoStore.getState().loadMoreCommits(10);

      expect(commands.getLog).toHaveBeenCalledWith("/test/repo", 11, { silent: true });
      expect(useRepoStore.getState().commits.length).toBe(2);
    });
  });

  describe("searchCommits & grepCode", () => {
    it("should update search results", async () => {
      (commands.searchCommits as any).mockResolvedValue([{ oid: "1" }]);
      (commands.grepCode as any).mockResolvedValue([{ filepath: "file.txt" }]);

      await useRepoStore.getState().searchCommits("my query");
      await useRepoStore.getState().grepCode("code query");

      const state = useRepoStore.getState();
      expect(state.commitSearchResults).toEqual([{ oid: "1" }]);
      expect(state.grepSearchResults).toEqual([{ filepath: "file.txt" }]);
    });
  });
});
