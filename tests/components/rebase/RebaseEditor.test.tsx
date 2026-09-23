import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { RebaseEditor } from "../../../src/components/rebase/RebaseEditor";
import type { RebaseTodoItem } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const PLAN: RebaseTodoItem[] = [
  {
    action: "pick",
    oid: "aaaaaaa1111111111111111111111111111111",
    summary: "first commit",
  },
  {
    action: "pick",
    oid: "bbbbbbb2222222222222222222222222222222",
    summary: "second commit",
  },
];

describe("RebaseEditor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve(undefined));
    useUIStore.setState({ confirmOptions: null });
  });

  it("shows an empty state when there is no active rebase", () => {
    useRepoStore.setState({
      activeTabId: "/repo",
      rebaseStatus: null,
      rebaseTodoItems: [],
      rebaseUpstream: null,
    });

    render(<RebaseEditor />);

    expect(screen.getByText("No active rebase session")).toBeInTheDocument();
  });

  it("renders the plan with one row per commit while planning", () => {
    useRepoStore.setState({
      activeTabId: "/repo",
      rebaseStatus: { status: "planning", currentOid: null, message: null },
      rebaseTodoItems: PLAN,
      rebaseUpstream: "main",
    });

    render(<RebaseEditor />);

    expect(screen.getByText("first commit")).toBeInTheDocument();
    expect(screen.getByText("second commit")).toBeInTheDocument();
    expect(screen.getByText(PLAN[0].oid.slice(0, 7))).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Start Rebase/i }),
    ).toBeInTheDocument();
  });

  it("asks for confirmation before starting the rebase, and only applies it once confirmed", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({
      activeTabId: "/repo",
      rebaseStatus: { status: "planning", currentOid: null, message: null },
      rebaseTodoItems: PLAN,
      rebaseUpstream: "main",
    });
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "rebase_start") {
        return Promise.resolve({
          status: "finished",
          currentOid: null,
          message: null,
        });
      }
      if (cmd === "get_status" || cmd === "get_commits") {
        return Promise.resolve(cmd === "get_status" ? null : []);
      }
      return Promise.resolve(undefined);
    });

    render(<RebaseEditor />);

    await user.click(screen.getByRole("button", { name: /Start Rebase/i }));

    await waitFor(() => {
      expect(useUIStore.getState().confirmOptions).not.toBeNull();
    });
    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.isDanger).toBe(true);
    expect(confirm?.message).toMatch(/rewrites 2 commit/i);

    // Nothing has been applied to the repository yet.
    expect(invokeMock.mock.calls.some((c) => c[0] === "rebase_start")).toBe(
      false,
    );

    await confirm?.onConfirm();

    await waitFor(() => {
      expect(invokeMock.mock.calls.some((c) => c[0] === "rebase_start")).toBe(
        true,
      );
    });
  });
});
