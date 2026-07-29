import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { FileDiff } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
import type { useRepoStore } from "../repo-store";
import { createStagingSlice } from "../slices/staging-slice";
import type { RepoState } from "../types";

vi.mock("../../lib/tauri-commands", () => ({
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  discardChanges: vi.fn(),
  applyPatch: vi.fn(),
  createCommit: vi.fn(),
  getStatus: vi.fn(),
  getLog: vi.fn(),
  getFileDiff: vi.fn(),
  getConflictStages: vi.fn(),
  saveMergedResolution: vi.fn(),
}));

describe("staging-slice", () => {
  let useTestStore: typeof useRepoStore;

  beforeEach(() => {
    vi.clearAllMocks();
    useTestStore = create<RepoState>(
      (...a) =>
        ({
          ...createStagingSlice(...a),
          activeTabId: "/mock/repo",
          status: null,
          loadingStates: {
            global: false,
            commits: false,
            status: false,
            diff: false,
            staging: false,
            branches: false,
            blame: false,
            history: false,
            stashes: false,
            search: false,
            collaboration: false,
            settings: false,
          },
          isLoading: false,
          isRefreshing: false,
          error: null,
          errors: {},
          refreshGeneration: 0,
          refreshStatus: vi.fn().mockResolvedValue(undefined),
          refreshCommitsAndStatus: vi.fn().mockResolvedValue(undefined),
        }) as unknown as RepoState,
    );
  });

  it("selects local file and fetches diff", async () => {
    const mockDiff = {
      path: "src/App.tsx",
      oldPath: null,
      status: "modified",
      hunks: [],
      isBinary: false,
    };
    vi.mocked(commands.getFileDiff).mockResolvedValue(
      mockDiff as unknown as FileDiff,
    );

    await useTestStore.getState().selectLocalFile("src/App.tsx", false);

    expect(useTestStore.getState().selectedFilePath).toBe("src/App.tsx");
    expect(useTestStore.getState().selectedFileIsStaged).toBe(false);
    expect(useTestStore.getState().localDiff).toEqual(mockDiff);
    expect(commands.getFileDiff).toHaveBeenCalledWith(
      "/mock/repo",
      "src/App.tsx",
      false,
      { silent: true },
    );
  });

  it("stages files and refreshes status", async () => {
    vi.mocked(commands.stageFiles).mockResolvedValue(undefined);

    await useTestStore.getState().stageFiles(["src/App.tsx"]);

    expect(commands.stageFiles).toHaveBeenCalledWith(
      "/mock/repo",
      ["src/App.tsx"],
      { errorPrefix: "Failed to stage files" },
    );
    expect(useTestStore.getState().refreshStatus).toHaveBeenCalled();
  });

  it("unstages files and refreshes status", async () => {
    vi.mocked(commands.unstageFiles).mockResolvedValue(undefined);

    await useTestStore.getState().unstageFiles(["src/App.tsx"]);

    expect(commands.unstageFiles).toHaveBeenCalledWith(
      "/mock/repo",
      ["src/App.tsx"],
      { errorPrefix: "Failed to unstage files" },
    );
    expect(useTestStore.getState().refreshStatus).toHaveBeenCalled();
  });

  it("discards changes and clears selectedFilePath if matched", async () => {
    useTestStore.setState({ selectedFilePath: "src/App.tsx" });
    vi.mocked(commands.discardChanges).mockResolvedValue(undefined);

    await useTestStore.getState().discardChanges(["src/App.tsx"]);

    expect(commands.discardChanges).toHaveBeenCalledWith(
      "/mock/repo",
      ["src/App.tsx"],
      { errorPrefix: "Failed to discard changes" },
    );
    expect(useTestStore.getState().selectedFilePath).toBeNull();
    expect(useTestStore.getState().refreshStatus).toHaveBeenCalled();
  });
});
