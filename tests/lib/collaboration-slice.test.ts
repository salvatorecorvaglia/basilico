import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import type { BranchInfo } from "../../src/lib/git-types";
import { useRepoStore } from "../../src/store/repo-store";
import { INITIAL_LOADING_STATES } from "../../src/store/types";

const branch = (over: Partial<BranchInfo>): BranchInfo => ({
  name: "main",
  isHead: false,
  isRemote: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  oid: "0".repeat(40),
  ...over,
});

/** The arguments the last call to `cmd` was made with. */
const argsOf = (cmd: string) =>
  invokeMock.mock.calls.filter((c) => c[0] === cmd).pop()?.[1];

beforeEach(() => {
  invokeMock.mockReset();
  // Every refresh command resolves to something harmless.
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "get_status" || cmd === "get_repo_info") {
      return Promise.resolve(null);
    }
    if (cmd === "merge_branch" || cmd === "pull") {
      return Promise.resolve("success");
    }
    return Promise.resolve([]);
  });
  useRepoStore.setState({
    activeTabId: "/repo",
    branches: [],
    commits: [],
    logKey: null,
    refreshGeneration: 0,
    loadingStates: { ...INITIAL_LOADING_STATES },
    isLoading: false,
    isRefreshing: false,
  });
});

describe("collaboration slice — sync", () => {
  // The lease is the remote-tracking tip of the branch's actual upstream —
  // which can have a different name than the local branch.
  it("sends the upstream's tracking tip as the force-push lease", async () => {
    useRepoStore.setState({
      branches: [
        branch({ name: "feature", isHead: true, upstream: "origin/shared" }),
        branch({ name: "origin/shared", isRemote: true, oid: "a".repeat(40) }),
        branch({ name: "origin/feature", isRemote: true, oid: "b".repeat(40) }),
      ],
    });

    await useRepoStore.getState().push("origin", "feature", true);

    expect(argsOf("push")).toMatchObject({
      path: "/repo",
      remote: "origin",
      branch: "feature",
      force: true,
      expectedRemoteOid: "a".repeat(40),
    });
  });

  it("falls back to <remote>/<branch> when the branch has no upstream there", async () => {
    useRepoStore.setState({
      branches: [
        branch({ name: "topic", upstream: "fork/topic" }),
        branch({ name: "origin/topic", isRemote: true, oid: "c".repeat(40) }),
      ],
    });

    await useRepoStore.getState().push("origin", "topic", true);
    expect(argsOf("push")).toMatchObject({ expectedRemoteOid: "c".repeat(40) });
  });

  it("passes the pull mode through, and none for the repository default", async () => {
    await useRepoStore.getState().pull("origin", "main", "ff-only");
    expect(argsOf("pull")).toMatchObject({ mode: "ff-only" });

    await useRepoStore.getState().pull("origin", "main");
    expect(argsOf("pull")).toMatchObject({ mode: null });
  });

  it("refreshes branches after a fetch", async () => {
    await useRepoStore.getState().fetch("origin");
    expect(argsOf("fetch")).toMatchObject({ path: "/repo", remote: "origin" });
    expect(invokeMock.mock.calls.some((c) => c[0] === "list_branches")).toBe(
      true,
    );
  });
});

describe("collaboration slice — targeted refreshes", () => {
  const called = (cmd: string) =>
    invokeMock.mock.calls.some((c) => c[0] === cmd);

  // A fetch or push moves remote-tracking refs and nothing else, so the
  // stash, remote, worktree and submodule lists are not re-read.
  it("reloads only refs, log and status after a fetch or push", async () => {
    await useRepoStore.getState().fetch("origin");
    await useRepoStore.getState().push("origin", "main", false);

    for (const cmd of ["get_status", "list_branches", "list_tags"]) {
      expect(called(cmd)).toBe(true);
    }
    for (const cmd of [
      "list_stashes",
      "list_remotes",
      "list_worktrees",
      "list_submodules",
      "get_repo_info",
    ]) {
      expect(called(cmd)).toBe(false);
    }
  });

  it("also reloads repo info and worktrees after a checkout", async () => {
    await useRepoStore.getState().checkoutBranch("feature");
    expect(called("get_repo_info")).toBe(true);
    expect(called("list_worktrees")).toBe(true);
    expect(called("list_stashes")).toBe(false);
  });

  it("still reloads everything on refreshAll", async () => {
    await useRepoStore.getState().refreshAll();
    for (const cmd of [
      "get_status",
      "list_branches",
      "list_tags",
      "list_remotes",
      "list_stashes",
      "get_repo_info",
      "list_worktrees",
      "list_submodules",
    ]) {
      expect(called(cmd)).toBe(true);
    }
  });
});

describe("collaboration slice — without an open repository", () => {
  beforeEach(() => {
    useRepoStore.setState({ activeTabId: null });
  });

  it("does nothing for the actions that have nothing to act on", async () => {
    await useRepoStore.getState().fetch("origin");
    await useRepoStore.getState().push("origin", "main", false);
    await useRepoStore.getState().checkoutBranch("main");
    await useRepoStore.getState().createBranch("new");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reports merge and pull as not done", async () => {
    expect(await useRepoStore.getState().mergeBranch("x")).toBe("conflicts");
    expect(await useRepoStore.getState().pull("origin", "main")).toBe(
      "conflicts",
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("refuses history-rewriting actions outright", async () => {
    await expect(
      useRepoStore.getState().resetToCommit("a".repeat(40), "hard"),
    ).rejects.toThrow("No active repository");
    await expect(
      useRepoStore.getState().cherryPickCommit("a".repeat(40)),
    ).rejects.toThrow("No active repository");
  });
});

describe("collaboration slice — loading state", () => {
  it("shows the collaboration spinner only while the action runs", async () => {
    let release: (v: unknown) => void = () => {};
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "fetch"
        ? new Promise((r) => {
            release = r;
          })
        : Promise.resolve([]),
    );

    const fetching = useRepoStore.getState().fetch("origin");
    expect(useRepoStore.getState().loadingStates.collaboration).toBe(true);
    release(undefined);
    await fetching;
    expect(useRepoStore.getState().loadingStates.collaboration).toBe(false);
  });
});
