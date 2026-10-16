import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import type { SubmoduleInfo, WorktreeInfo } from "../../src/lib/git-types";
import { useRepoStore } from "../../src/store/repo-store";
import { INITIAL_LOADING_STATES } from "../../src/store/types";
import { useUIStore } from "../../src/store/ui-store";

const WORKTREES: WorktreeInfo[] = [
  { path: "/repo", name: "repo", head: "h", branch: "main" },
];
const SUBMODULES: SubmoduleInfo[] = [
  { name: "lib", path: "lib", url: null, headOid: null, status: "dirty" },
];

const calls = (cmd: string) =>
  invokeMock.mock.calls.filter((c) => c[0] === cmd).map((c) => c[1]);

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "list_worktrees") return Promise.resolve(WORKTREES);
    if (cmd === "list_submodules") return Promise.resolve(SUBMODULES);
    return Promise.resolve(undefined);
  });
  useRepoStore.setState({
    activeTabId: "/repo",
    worktrees: [],
    submodules: [],
    refreshGeneration: 0,
    loadingStates: { ...INITIAL_LOADING_STATES },
  });
  useUIStore.setState({ notifications: [] });
});

describe("worktree & submodule slice", () => {
  it("loads worktrees and submodules", async () => {
    await useRepoStore.getState().loadWorktrees();
    await useRepoStore.getState().loadSubmodules();
    expect(useRepoStore.getState().worktrees).toEqual(WORKTREES);
    expect(useRepoStore.getState().submodules).toEqual(SUBMODULES);
    expect(useRepoStore.getState().loadingStates.collaboration).toBe(false);
  });

  it("drops a list that arrives after the tab changed", async () => {
    let release: (v: unknown) => void = () => {};
    invokeMock.mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );

    const loading = useRepoStore.getState().loadWorktrees();
    useRepoStore.setState({ refreshGeneration: 1 });
    release(WORKTREES);
    await loading;

    expect(useRepoStore.getState().worktrees).toEqual([]);
  });

  it("keeps the old list, silently, when listing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useRepoStore.setState({ worktrees: WORKTREES });
    invokeMock.mockRejectedValue(new Error("not a repo"));

    await useRepoStore.getState().loadWorktrees();
    expect(useRepoStore.getState().worktrees).toEqual(WORKTREES);
    expect(useUIStore.getState().notifications).toEqual([]);
  });

  it("reloads the worktree list after each worktree mutation", async () => {
    await useRepoStore.getState().addWorktree("../wt", "main", null);
    await useRepoStore.getState().removeWorktree("../wt");
    await useRepoStore.getState().pruneWorktrees();

    expect(calls("add_worktree")[0]).toMatchObject({
      repoPath: "/repo",
      path: "../wt",
      branch: "main",
    });
    expect(calls("remove_worktree")[0]).toMatchObject({ force: false });
    expect(calls("prune_worktrees")).toHaveLength(1);
    expect(calls("list_worktrees")).toHaveLength(3);
  });

  it("reloads the submodule list after each submodule mutation", async () => {
    await useRepoStore.getState().initSubmodules(["lib"]);
    await useRepoStore.getState().updateSubmodules(["lib"]);
    await useRepoStore.getState().syncSubmodules([]);
    await useRepoStore.getState().addSubmodule("https://x/y.git", "y");

    expect(calls("update_submodules")[0]).toMatchObject({
      paths: ["lib"],
      recursive: false,
    });
    expect(calls("add_submodule")[0]).toMatchObject({
      url: "https://x/y.git",
      path: "y",
    });
    expect(calls("list_submodules")).toHaveLength(4);
  });

  it("does nothing without an open repository", async () => {
    useRepoStore.setState({ activeTabId: null });
    await useRepoStore.getState().loadWorktrees();
    await useRepoStore.getState().loadSubmodules();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
