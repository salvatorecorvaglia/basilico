import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { useBranchTree } from "../../../src/components/sidebar/BranchTree";
import type { BranchInfo } from "../../../src/lib/git-types";
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
    name: "feature/x",
    isHead: false,
    isRemote: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    oid: "def456",
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
];

// useBranchTree is a hook, not a JSX component — it returns
// `{ count, icon, action, content }` (see Sidebar.tsx), not an element. A
// minimal host component is required to call it under React's rules of hooks.
function Harness({ branches }: { branches: BranchInfo[] }) {
  const { content } = useBranchTree({ branches });
  return <div>{content}</div>;
}

describe("useBranchTree", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    useRepoStore.setState({ activeTabId: "/repo", remotes: [] });
    useUIStore.setState({ confirmOptions: null });
  });

  it("renders only local branches, excluding remote-tracking ones", () => {
    render(<Harness branches={BRANCHES} />);

    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("feature/x")).toBeInTheDocument();
    expect(screen.queryByText("origin/main")).not.toBeInTheDocument();
  });

  it("checks out a branch on double-click", async () => {
    const user = userEvent.setup();
    render(<Harness branches={BRANCHES} />);

    await user.dblClick(screen.getByText("feature/x"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "checkout_branch",
        expect.objectContaining({ path: "/repo", name: "feature/x" }),
      );
    });
  });

  it("asks for confirmation before deleting a branch, and only deletes once confirmed", async () => {
    const user = userEvent.setup();
    render(<Harness branches={BRANCHES} />);

    fireEvent.contextMenu(screen.getByText("feature/x"));
    await user.click(await screen.findByText("Delete Branch"));

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
          name: "feature/x",
          isRemote: false,
        }),
      );
    });
  });
});
