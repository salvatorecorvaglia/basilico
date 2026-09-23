import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { StagingArea } from "../../../src/components/staging/StagingArea";
import type { RepoStatus } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const STATUS: RepoStatus = {
  branch: "main",
  ahead: 0,
  behind: 0,
  staged: [{ path: "staged.txt", status: "modified", isStaged: true }],
  unstaged: [{ path: "unstaged.txt", status: "modified", isStaged: false }],
  untracked: [],
  conflicted: [],
  state: "Clean",
};

describe("StagingArea", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_status") return Promise.resolve(STATUS);
      return Promise.resolve(undefined);
    });

    useRepoStore.setState({
      activeTabId: "/repo",
      status: STATUS,
      commits: [],
      selectedFilePath: null,
      selectedFileIsStaged: false,
      localDiff: null,
      settings: null,
    });
    useUIStore.setState({ confirmOptions: null });
  });

  it("renders staged and unstaged files in their respective sections", () => {
    render(<StagingArea />);

    expect(screen.getByText("Staged Changes")).toBeInTheDocument();
    expect(screen.getByText("Unstaged Changes")).toBeInTheDocument();
    expect(screen.getByText("staged.txt")).toBeInTheDocument();
    expect(screen.getByText("unstaged.txt")).toBeInTheDocument();
  });

  it("stages an unstaged file when its checkbox is checked", async () => {
    const user = userEvent.setup();
    render(<StagingArea />);

    const row = screen.getByText("unstaged.txt").closest(".staging-file-row");
    const checkbox = row?.querySelector("input[type=checkbox]");
    await user.click(checkbox as Element);

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          (c) =>
            c[0] === "stage_files" &&
            (c[1] as { files: string[] }).files.includes("unstaged.txt"),
        ),
      ).toBe(true);
    });
  });

  it("unstages a staged file when its checkbox is unchecked", async () => {
    const user = userEvent.setup();
    render(<StagingArea />);

    const row = screen.getByText("staged.txt").closest(".staging-file-row");
    const checkbox = row?.querySelector("input[type=checkbox]");
    await user.click(checkbox as Element);

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          (c) =>
            c[0] === "unstage_files" &&
            (c[1] as { files: string[] }).files.includes("staged.txt"),
        ),
      ).toBe(true);
    });
  });

  it("asks for confirmation before discarding, and only discards once confirmed", async () => {
    const user = userEvent.setup();
    render(<StagingArea />);

    const row = screen.getByText("unstaged.txt").closest(".staging-file-row");
    const discardBtn = row?.querySelector(".staging-discard-btn");
    await user.click(discardBtn as Element);

    await waitFor(() => {
      expect(useUIStore.getState().confirmOptions).not.toBeNull();
    });
    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.isDanger).toBe(true);

    // Nothing has been discarded yet — only after confirmation.
    expect(invokeMock.mock.calls.some((c) => c[0] === "discard_changes")).toBe(
      false,
    );

    await confirm?.onConfirm();

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          (c) =>
            c[0] === "discard_changes" &&
            (c[1] as { files: string[] }).files.includes("unstaged.txt"),
        ),
      ).toBe(true);
    });
  });
});
