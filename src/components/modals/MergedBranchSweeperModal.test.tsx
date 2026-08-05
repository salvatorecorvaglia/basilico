import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import type { BranchInfo } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import { MergedBranchSweeperModal } from "./MergedBranchSweeperModal";

function branch(name: string, isRemote: boolean): BranchInfo {
  return {
    name,
    isHead: false,
    isRemote,
    upstream: null,
    ahead: 0,
    behind: 0,
    oid: `oid-${name}`,
  };
}

const MERGED = [
  branch("feature/done", false),
  branch("origin/feature/done", true),
];

describe("MergedBranchSweeperModal", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useRepoStore.setState({
      activeTabId: "/repo",
      branches: [branch("main", false)],
      repoInfo: {
        path: "/repo",
        name: "repo",
        headBranch: "main",
        isBare: false,
        isEmpty: false,
        state: "Clean",
      },
    });
    useUIStore.setState({ confirmOptions: null });

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_merged_branches") return Promise.resolve(MERGED);
      return Promise.resolve(undefined);
    });
  });

  it("selects nothing by default", async () => {
    render(<MergedBranchSweeperModal open onOpenChange={() => {}} />);

    await screen.findByText("feature/done");

    // Pre-selecting every merged branch — including remotes — meant one click
    // could delete branches from the server.
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((b) => !b.checked)).toBe(true);
    expect(screen.getByText(/0 of 2 selected/)).toBeInTheDocument();
  });

  it("keeps the delete button disabled until something is selected", async () => {
    render(<MergedBranchSweeperModal open onOpenChange={() => {}} />);
    await screen.findByText("feature/done");

    const button = screen.getByRole("button", { name: /Prune Selected/i });
    expect(button).toBeDisabled();
  });

  it("asks for confirmation instead of deleting immediately", async () => {
    const user = userEvent.setup();
    render(<MergedBranchSweeperModal open onOpenChange={() => {}} />);
    await screen.findByText("feature/done");

    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0]);
    await user.click(screen.getByRole("button", { name: /Prune Selected/i }));

    await waitFor(() => {
      expect(useUIStore.getState().confirmOptions).not.toBeNull();
    });

    // Crucially, nothing has been deleted yet.
    expect(invokeMock.mock.calls.some((c) => c[0] === "delete_branch")).toBe(
      false,
    );
  });

  it("warns explicitly when the selection includes a remote branch", async () => {
    const user = userEvent.setup();
    render(<MergedBranchSweeperModal open onOpenChange={() => {}} />);
    await screen.findByText("origin/feature/done");

    // Select the remote branch specifically.
    const remoteRow = screen.getByText("origin/feature/done").closest("label");
    const remoteBox = remoteRow?.querySelector("input[type=checkbox]");
    await user.click(remoteBox as Element);

    await user.click(screen.getByRole("button", { name: /Prune Selected/i }));

    await waitFor(() => {
      expect(useUIStore.getState().confirmOptions).not.toBeNull();
    });

    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.isDanger).toBe(true);
    expect(confirm?.message).toMatch(/pushes the deletion to the server/i);
    expect(confirm?.message).toContain("origin/feature/done");
  });

  it("deletes only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    render(<MergedBranchSweeperModal open onOpenChange={() => {}} />);
    await screen.findByText("feature/done");

    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0]);
    await user.click(screen.getByRole("button", { name: /Prune Selected/i }));

    await waitFor(() =>
      expect(useUIStore.getState().confirmOptions).not.toBeNull(),
    );

    await useUIStore.getState().confirmOptions?.onConfirm();

    await waitFor(() => {
      expect(invokeMock.mock.calls.some((c) => c[0] === "delete_branch")).toBe(
        true,
      );
    });
  });
});
