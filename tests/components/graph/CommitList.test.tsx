import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { CommitList } from "../../../src/components/graph/CommitList";
import type { GraphCommit } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { INITIAL_LOADING_STATES } from "../../../src/store/types";

function commit(oid: string): GraphCommit {
  return {
    oid,
    shortOid: oid,
    message: `commit ${oid}`,
    authorName: "Author",
    authorEmail: "a@a.a",
    authorDate: 0,
    committerName: "Author",
    committerDate: 0,
    parentOids: [],
    refs: [],
    lane: 0,
    edges: [],
  };
}

describe("CommitList", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([]);
    useRepoStore.setState({
      activeTabId: "/repo",
      commits: [commit("a"), commit("b"), commit("c")],
      selectedCommitOid: "a",
      commitDiff: [],
      isLoading: false,
      loadingStates: { ...INITIAL_LOADING_STATES },
      hasMoreCommits: true,
      settings: null,
      remotes: [],
    });
  });

  it("selects the next/previous row on ArrowDown/ArrowUp", async () => {
    render(<CommitList />);
    await waitFor(() => {
      expect(screen.getByText("commit a")).toBeInTheDocument();
    });

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    await waitFor(() => {
      expect(useRepoStore.getState().selectedCommitOid).toBe("b");
    });

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    await waitFor(() => {
      expect(useRepoStore.getState().selectedCommitOid).toBe("c");
    });

    // Already at the last row — ArrowDown must not run off the end.
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    await waitFor(() => {
      expect(useRepoStore.getState().selectedCommitOid).toBe("c");
    });

    fireEvent.keyDown(document.body, { key: "ArrowUp" });
    await waitFor(() => {
      expect(useRepoStore.getState().selectedCommitOid).toBe("b");
    });
  });

  it("loads more commits once the scroll position nears the bottom", async () => {
    const { container } = render(<CommitList />);
    await waitFor(() => {
      expect(screen.getByText("commit a")).toBeInTheDocument();
    });

    const scrollEl = container.querySelector(".commit-list-scroll");
    expect(scrollEl).not.toBeNull();
    if (!scrollEl) throw new Error("scroll container not found");

    Object.defineProperty(scrollEl, "scrollHeight", {
      configurable: true,
      value: 10000,
    });
    Object.defineProperty(scrollEl, "clientHeight", {
      configurable: true,
      value: 600,
    });

    // Comfortably above the load-more threshold (scrollHeight - 500): no
    // fetch yet.
    Object.defineProperty(scrollEl, "scrollTop", {
      configurable: true,
      value: 1000,
    });
    fireEvent.scroll(scrollEl);
    expect(invokeMock.mock.calls.some((c) => c[0] === "get_log")).toBe(false);

    // Within the threshold: scrollTop + clientHeight >= scrollHeight - 500.
    Object.defineProperty(scrollEl, "scrollTop", {
      configurable: true,
      value: 9500,
    });
    fireEvent.scroll(scrollEl);

    await waitFor(() => {
      expect(invokeMock.mock.calls.some((c) => c[0] === "get_log")).toBe(true);
    });
  });
});
