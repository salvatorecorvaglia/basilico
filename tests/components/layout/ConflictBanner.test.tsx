import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { ConflictBanner } from "../../../src/components/layout/ConflictBanner";
import type { RepoState, RepoStatus } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";

function status(state: RepoState, conflicted: string[] = []): RepoStatus {
  return {
    branch: "main",
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted,
    state,
  };
}

describe("ConflictBanner — abort routing", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useRepoStore.setState({
      abortMerge: vi.fn().mockResolvedValue(undefined),
      cherryPickAbort: vi.fn().mockResolvedValue(undefined),
      revertAbort: vi.fn().mockResolvedValue(undefined),
      stepRebase: vi.fn().mockResolvedValue({
        status: "none",
        currentOid: null,
        message: null,
      }),
    });
  });

  it("aborts a merge with abortMerge", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({ status: status("Merge", ["a.txt"]) });
    render(<ConflictBanner />);

    await user.click(screen.getByRole("button", { name: /Abort/ }));

    await waitFor(() => {
      expect(useRepoStore.getState().abortMerge).toHaveBeenCalled();
    });
  });

  // B5: `RebaseInteractive`/`RebaseMerge` fall through to `abortMerge`, which
  // runs `git merge --abort` and fails because there is no MERGE_HEAD. A
  // rebase must be aborted through the rebase flow.
  it("aborts an interactive rebase through the rebase flow, not merge --abort", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({ status: status("RebaseInteractive", ["a.txt"]) });
    render(<ConflictBanner />);

    await user.click(screen.getByRole("button", { name: /Abort/ }));

    await waitFor(() => {
      expect(useRepoStore.getState().stepRebase).toHaveBeenCalledWith("abort");
    });
    expect(useRepoStore.getState().abortMerge).not.toHaveBeenCalled();
  });
});
