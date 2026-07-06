import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock tauri-commands before importing the store
vi.mock("../../lib/tauri-commands", () => ({
  checkoutBranch: vi.fn(),
  createBranch: vi.fn(),
  deleteBranch: vi.fn(),
  renameBranch: vi.fn(),
  deleteTag: vi.fn(),
  createTag: vi.fn(),
  pushTag: vi.fn(),
  mergeBranch: vi.fn(),
  abortMerge: vi.fn(),
  resolveConflict: vi.fn(),
  fetch: vi.fn(),
  pull: vi.fn(),
  push: vi.fn(),
  rebaseInit: vi.fn(),
  rebaseWriteTodo: vi.fn(),
  rebaseStep: vi.fn(),
  listWorktrees: vi.fn(),
  listSubmodules: vi.fn(),
}));

import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../repo-store";

describe("collaboration-slice", () => {
  beforeEach(() => {
    useRepoStore.setState({
      activeTabId: "/test/repo",
      rebaseTodoItems: [],
      rebaseStatus: null,
      bisectState: null,
      worktrees: [],
      submodules: [],
      commitTree: [],
      compareDiff: [],
      isLoading: false,
      error: null,
      errors: {},
    });
    // Mock the refresh methods on the store
    useRepoStore.getState().refreshAll = vi.fn().mockResolvedValue(undefined);
    useRepoStore.getState().refreshBranches = vi.fn().mockResolvedValue(undefined);
    useRepoStore.getState().refreshStatus = vi.fn().mockResolvedValue(undefined);
    useRepoStore.getState().refreshCommitsAndStatus = vi.fn().mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  describe("checkoutBranch", () => {
    it("should call checkoutBranch tauri command and refreshAll", async () => {
      (commands.checkoutBranch as any).mockResolvedValue(undefined);

      await useRepoStore.getState().checkoutBranch("feature-branch");

      expect(commands.checkoutBranch).toHaveBeenCalledWith("/test/repo", "feature-branch", {
        errorPrefix: "Failed to checkout branch",
      });
      expect(useRepoStore.getState().refreshAll).toHaveBeenCalled();
    });
  });

  describe("createBranch", () => {
    it("should call createBranch tauri command and refreshBranches", async () => {
      (commands.createBranch as any).mockResolvedValue(undefined);

      await useRepoStore.getState().createBranch("new-branch", "main");

      expect(commands.createBranch).toHaveBeenCalledWith("/test/repo", "new-branch", "main", {
        errorPrefix: "Failed to create branch",
      });
      expect(useRepoStore.getState().refreshBranches).toHaveBeenCalled();
    });
  });

  describe("deleteBranch", () => {
    it("should call deleteBranch tauri command and refreshBranches", async () => {
      (commands.deleteBranch as any).mockResolvedValue(undefined);

      await useRepoStore.getState().deleteBranch("old-branch", false);

      expect(commands.deleteBranch).toHaveBeenCalledWith("/test/repo", "old-branch", false, {
        errorPrefix: "Failed to delete branch",
      });
      expect(useRepoStore.getState().refreshBranches).toHaveBeenCalled();
    });
  });

  describe("renameBranch", () => {
    it("should call renameBranch tauri command and refreshBranches", async () => {
      (commands.renameBranch as any).mockResolvedValue(undefined);

      await useRepoStore.getState().renameBranch("old-name", "new-name");

      expect(commands.renameBranch).toHaveBeenCalledWith("/test/repo", "old-name", "new-name", {
        errorPrefix: "Failed to rename branch",
      });
      expect(useRepoStore.getState().refreshBranches).toHaveBeenCalled();
    });
  });

  describe("mergeBranch", () => {
    it("should call mergeBranch and refreshCommitsAndStatus", async () => {
      (commands.mergeBranch as any).mockResolvedValue("success");

      const result = await useRepoStore.getState().mergeBranch("feature");

      expect(result).toBe("success");
      expect(commands.mergeBranch).toHaveBeenCalledWith("/test/repo", "feature", {
        errorPrefix: "Failed to merge",
      });
      expect(useRepoStore.getState().refreshCommitsAndStatus).toHaveBeenCalled();
    });
  });

  describe("fetch, pull, and push", () => {
    it("should fetch from remote and refreshAll", async () => {
      (commands.fetch as any).mockResolvedValue(undefined);

      await useRepoStore.getState().fetch("origin");

      expect(commands.fetch).toHaveBeenCalledWith("/test/repo", "origin", {
        errorPrefix: "Fetch failed",
      });
      expect(useRepoStore.getState().refreshAll).toHaveBeenCalled();
    });

    it("should pull from remote and refreshAll", async () => {
      (commands.pull as any).mockResolvedValue("success");

      const result = await useRepoStore.getState().pull("origin", "main");

      expect(result).toBe("success");
      expect(commands.pull).toHaveBeenCalledWith("/test/repo", "origin", "main", {
        errorPrefix: "Pull failed",
      });
      expect(useRepoStore.getState().refreshAll).toHaveBeenCalled();
    });

    it("should push to remote and refreshAll", async () => {
      (commands.push as any).mockResolvedValue(undefined);

      await useRepoStore.getState().push("origin", "main", true);

      expect(commands.push).toHaveBeenCalledWith("/test/repo", "origin", "main", true, {
        errorPrefix: "Push failed",
      });
      expect(useRepoStore.getState().refreshAll).toHaveBeenCalled();
    });
  });

  describe("error handling with withLoading", () => {
    it("should capture and set error in errors map when action fails", async () => {
      const err = new Error("Network connection lost");
      (commands.fetch as any).mockRejectedValue(err);

      await expect(useRepoStore.getState().fetch("origin")).rejects.toThrow("Network connection lost");

      const state = useRepoStore.getState();
      expect(state.errors.collaboration).toContain("Network connection lost");
    });
  });
});
