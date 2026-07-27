import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRepoStore } from "../../store/repo-store";
import { StagingArea } from "../staging/StagingArea";

vi.mock("../../store/repo-store", () => ({
  useRepoStore: vi.fn(),
}));

vi.mock("../../store/ui-store", () => ({
  useUIStore: vi.fn(() => ({
    setActiveView: vi.fn(),
    addNotification: vi.fn(),
    openPrompt: vi.fn(),
    openConfirm: vi.fn(),
  })),
}));

describe("StagingArea", () => {
  it("renders empty staging state when no repository status is present", () => {
    vi.mocked(useRepoStore).mockReturnValue({
      status: null,
      commits: [],
      selectedFilePath: null,
      selectLocalFile: vi.fn(),
      stageFiles: vi.fn(),
      unstageFiles: vi.fn(),
      discardChanges: vi.fn(),
      saveStash: vi.fn(),
      cherryPickAbort: vi.fn(),
      revertAbort: vi.fn(),
    } as any);

    render(<StagingArea />);
    expect(screen.getByText("No repository status available")).toBeDefined();
  });

  it("renders staged and unstaged file items correctly", () => {
    const mockStageFiles = vi.fn();
    const mockUnstageFiles = vi.fn();

    vi.mocked(useRepoStore).mockReturnValue({
      status: {
        staged: [{ path: "src/App.tsx", status: "modified", isStaged: true }],
        unstaged: [
          { path: "src/main.tsx", status: "modified", isStaged: false },
        ],
        untracked: ["README.md"],
        conflicted: [],
        state: "Clean",
      },
      commits: [],
      selectedFilePath: null,
      selectLocalFile: vi.fn(),
      stageFiles: mockStageFiles,
      unstageFiles: mockUnstageFiles,
      discardChanges: vi.fn(),
      saveStash: vi.fn(),
      cherryPickAbort: vi.fn(),
      revertAbort: vi.fn(),
    } as any);

    render(<StagingArea />);

    expect(screen.getByText("App.tsx")).toBeDefined();
    expect(screen.getByText("main.tsx")).toBeDefined();
    expect(screen.getByText("README.md")).toBeDefined();
  });
});
