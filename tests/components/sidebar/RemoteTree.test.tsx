import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { RemoteTree } from "../../../src/components/sidebar/RemoteTree";
import type { BranchInfo, RemoteInfo } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const BRANCHES: BranchInfo[] = [
  {
    name: "main",
    isHead: true,
    isRemote: false,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    oid: "abc123",
  },
  {
    name: "origin/main",
    isHead: false,
    isRemote: true,
    upstream: null,
    ahead: 0,
    behind: 0,
    oid: "abc123",
  },
  {
    name: "origin/feature",
    isHead: false,
    isRemote: true,
    upstream: null,
    ahead: 0,
    behind: 0,
    oid: "def456",
  },
];

const REMOTES: RemoteInfo[] = [
  { name: "origin", url: "https://example.com/repo.git", pushUrl: null },
];

// RemoteTree, like BranchTree, is a plain function that calls hooks and
// returns `{ count, icon, content }` rather than JSX (see Sidebar.tsx). It
// needs a minimal host component to be called under React's rules of hooks.
function Harness({
  branches,
  remotes,
}: {
  branches: BranchInfo[];
  remotes: RemoteInfo[];
}) {
  const { content } = RemoteTree({ branches, remotes });
  return <div>{content}</div>;
}

describe("RemoteTree", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    useRepoStore.setState({ activeTabId: "/repo" });
    useUIStore.setState({ confirmOptions: null });
  });

  it("groups remote branches under their remote, with the remote prefix stripped", () => {
    render(<Harness branches={BRANCHES} remotes={REMOTES} />);

    expect(screen.getByText("origin")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("feature")).toBeInTheDocument();
  });

  it("checks out a remote branch on double-click", async () => {
    const user = userEvent.setup();
    render(<Harness branches={BRANCHES} remotes={REMOTES} />);

    await user.dblClick(screen.getByText("feature"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "checkout_branch",
        expect.objectContaining({ path: "/repo", name: "origin/feature" }),
      );
    });
  });

  it("asks for confirmation before deleting a remote branch, and only deletes once confirmed", async () => {
    const user = userEvent.setup();
    render(<Harness branches={BRANCHES} remotes={REMOTES} />);

    fireEvent.contextMenu(screen.getByText("feature"));
    await user.click(await screen.findByText("Delete Remote Branch"));

    await waitFor(() => {
      expect(useUIStore.getState().confirmOptions).not.toBeNull();
    });
    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.isDanger).toBe(true);

    expect(invokeMock.mock.calls.some((c) => c[0] === "delete_branch")).toBe(
      false,
    );

    await confirm?.onConfirm();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "delete_branch",
        expect.objectContaining({
          path: "/repo",
          name: "origin/feature",
          isRemote: true,
        }),
      );
    });
  });
});
