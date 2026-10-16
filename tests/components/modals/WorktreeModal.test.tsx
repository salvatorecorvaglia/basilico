import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { WorktreeModal } from "../../../src/components/modals/WorktreeModal";
import type { BranchInfo, WorktreeInfo } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const branch = (name: string): BranchInfo => ({
  name,
  isHead: false,
  isRemote: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  oid: `oid-${name}`,
});

const WORKTREES: WorktreeInfo[] = [
  { path: "/repo", name: "repo", head: "h1", branch: "main" },
  {
    path: "/repo-feature",
    name: "repo-feature",
    head: "h2",
    branch: "feature",
  },
];

const argsOf = (cmd: string) =>
  invokeMock.mock.calls.filter((c) => c[0] === cmd).pop()?.[1];

describe("WorktreeModal", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "list_worktrees"
        ? Promise.resolve(WORKTREES)
        : Promise.resolve(undefined),
    );
    useRepoStore.setState({
      activeTabId: "/repo",
      branches: [branch("main"), branch("feature")],
      openRepository: vi.fn().mockResolvedValue(undefined),
      refreshAll: vi.fn().mockResolvedValue(undefined),
      openInIde: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({ confirmOptions: null, notifications: [] });
  });

  it("lists worktrees, marking the main one and protecting it from removal", async () => {
    render(<WorktreeModal open onOpenChange={() => {}} />);

    expect(await screen.findByText("repo-feature")).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();
    // Only the linked worktree can be removed.
    expect(screen.getAllByTitle("Remove worktree")).toHaveLength(1);
  });

  it("shows the empty state when listing fails", async () => {
    invokeMock.mockRejectedValue(new Error("boom"));
    render(<WorktreeModal open onOpenChange={() => {}} />);
    expect(await screen.findByText("No Worktrees Found")).toBeInTheDocument();
  });

  it("opens a worktree as a tab and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<WorktreeModal open onOpenChange={onOpenChange} />);

    const [, featureOpen] = await screen.findAllByRole("button", {
      name: "Open Tab",
    });
    await user.click(featureOpen);
    expect(useRepoStore.getState().openRepository).toHaveBeenCalledWith(
      "/repo-feature",
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("removes a worktree only after confirmation", async () => {
    const user = userEvent.setup();
    render(<WorktreeModal open onOpenChange={() => {}} />);

    await user.click(await screen.findByTitle("Remove worktree"));
    expect(argsOf("remove_worktree")).toBeUndefined();

    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.isDanger).toBe(true);
    await act(async () => {
      await confirm?.onConfirm();
    });
    expect(argsOf("remove_worktree")).toMatchObject({
      repoPath: "/repo",
      worktreePath: "/repo-feature",
      force: false,
    });
  });

  it("adds a worktree for the chosen branch", async () => {
    const user = userEvent.setup();
    render(<WorktreeModal open onOpenChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Add Worktree" }));
    await user.type(
      screen.getByLabelText("Worktree Directory Path:"),
      "  ../wt  ",
    );
    await user.selectOptions(
      screen.getByLabelText("Checkout Branch:"),
      "feature",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm Add Worktree" }),
    );

    await waitFor(() =>
      expect(argsOf("add_worktree")).toMatchObject({
        repoPath: "/repo",
        path: "../wt",
        branch: "feature",
      }),
    );
  });

  // Regression: a file-watcher refresh gives `branches` a new identity, which
  // used to reset the form and throw away the half-typed path.
  it("keeps the add form intact when the branch list refreshes", async () => {
    const user = userEvent.setup();
    render(<WorktreeModal open onOpenChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Add Worktree" }));
    await user.type(screen.getByLabelText("Worktree Directory Path:"), "../wt");

    act(() => {
      useRepoStore.setState({ branches: [branch("main"), branch("feature")] });
    });

    expect(screen.getByLabelText("Worktree Directory Path:")).toHaveValue(
      "../wt",
    );
  });
});
