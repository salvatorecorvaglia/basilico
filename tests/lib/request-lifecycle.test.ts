import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (name: string, args?: unknown) => invokeMock(name, args),
}));

import { useRepoStore } from "../../src/store/repo-store";
import {
  INITIAL_LOADING_STATES,
  PER_TAB_RESET_STATE,
} from "../../src/store/types";
import { useUIStore } from "../../src/store/ui-store";

function deferred() {
  let resolve: (value: unknown) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const status = {
  branch: "main",
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
  state: "Clean",
};
function switchSession(path: string) {
  useRepoStore.setState((s) => ({
    ...PER_TAB_RESET_STATE,
    activeTabId: path,
    refreshGeneration: s.refreshGeneration + 1,
    loadingStates: { ...INITIAL_LOADING_STATES },
    isLoading: false,
    isRefreshing: false,
  }));
}
beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((name: string) =>
    Promise.resolve(name === "get_status" ? status : []),
  );
  switchSession("/a");
  useUIStore.setState({ notifications: [] });
});

describe("request lifecycle", () => {
  it("does not let an old session's diff or cleanup overwrite a new request", async () => {
    const old = deferred(),
      fresh = deferred();
    invokeMock
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const first = useRepoStore.getState().selectLocalFile("a", false);
    switchSession("/b");
    const second = useRepoStore.getState().selectLocalFile("a", false);
    old.resolve({ tag: "old" });
    await first;
    expect(useRepoStore.getState().loadingStates.diff).toBe(true);
    expect(useRepoStore.getState().localDiff).toBeNull();
    fresh.resolve({ tag: "fresh" });
    await second;
    expect(useRepoStore.getState().localDiff).toEqual({ tag: "fresh" });
    expect(useRepoStore.getState().isLoading).toBe(false);
  });

  it("orders repeated selections of the same staged file by request identity", async () => {
    const first = deferred(),
      second = deferred(),
      third = deferred();
    invokeMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const one = useRepoStore.getState().selectLocalFile("a", true);
    const two = useRepoStore.getState().selectLocalFile("a", false);
    const three = useRepoStore.getState().selectLocalFile("a", true);
    third.resolve({ tag: "latest staged" });
    await three;
    second.resolve({ tag: "unstaged" });
    await two;
    first.resolve({ tag: "stale staged" });
    await one;
    expect(useRepoStore.getState().localDiff).toEqual({ tag: "latest staged" });
    expect(useRepoStore.getState().isLoading).toBe(false);
  });

  it("keeps overlapping refresh indicators isolated across sessions", async () => {
    const old = deferred(),
      fresh = deferred();
    invokeMock
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const first = useRepoStore.getState().refreshStatus();
    switchSession("/b");
    const second = useRepoStore.getState().refreshStatus();
    old.resolve(status);
    await first;
    expect(useRepoStore.getState().isRefreshing).toBe(true);
    fresh.resolve(status);
    await second;
    expect(useRepoStore.getState().isRefreshing).toBe(false);
  });

  it.each(["searchCommits", "grepCode"] as const)(
    "invalidates %s on clear and ignores a stale failure",
    async (method) => {
      const old = deferred(),
        latest = deferred();
      invokeMock
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(latest.promise);
      const first = useRepoStore.getState()[method]("old");
      const second = useRepoStore.getState()[method]("new");
      latest.resolve([{ tag: "new" }]);
      await second;
      useRepoStore.getState().clearSearchResults();
      old.reject(new Error("old request failed"));
      await first;
      expect(useRepoStore.getState().commitSearchResults).toEqual([]);
      expect(useRepoStore.getState().grepSearchResults).toEqual([]);
      expect(useUIStore.getState().notifications).toEqual([]);
    },
  );

  it.each([
    ["loadFileBlame", "blameLines"],
    ["loadFileHistory", "fileHistory"],
  ] as const)(
    "keeps the newest %s result in the same repository",
    async (method, field) => {
      const old = deferred(),
        latest = deferred();
      invokeMock
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(latest.promise);
      const first = useRepoStore.getState()[method]("old.txt");
      const second = useRepoStore.getState()[method]("new.txt");
      latest.resolve([{ tag: "new" }]);
      await second;
      old.resolve([{ tag: "old" }]);
      await first;
      expect(useRepoStore.getState()[field]).toEqual([{ tag: "new" }]);
    },
  );

  it("does not refresh or select files in a new tab after a mutation completes", async () => {
    const staged = deferred();
    invokeMock.mockReturnValueOnce(staged.promise);
    const action = useRepoStore.getState().stageFiles(["a"]);
    switchSession("/b");
    staged.resolve(undefined);
    await action;
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("stage_files", {
      path: "/a",
      files: ["a"],
    });
  });

  it("keeps newer worktree data when an older background refresh fails", async () => {
    const old = deferred();
    invokeMock.mockImplementation((name: string) =>
      name === "list_worktrees" ? old.promise : Promise.resolve(status),
    );
    await useRepoStore.getState().refresh(["worktrees"]);
    invokeMock.mockResolvedValueOnce([
      { path: "/new", name: "new", head: "new", branch: "main" },
    ]);
    await useRepoStore.getState().loadWorktrees();
    old.reject(new Error("old background refresh"));
    await Promise.resolve();
    await Promise.resolve();
    expect(useRepoStore.getState().worktrees[0]?.path).toBe("/new");
  });

  it("discards pagination when filters change before the page resolves", async () => {
    const old = deferred(),
      filtered = deferred();
    let logs = 0;
    invokeMock.mockImplementation((name: string) => {
      if (name === "get_log")
        return ++logs === 1 ? old.promise : filtered.promise;
      if (name === "get_log_fingerprint") return Promise.resolve("refs");
      return Promise.resolve(status);
    });
    const page = useRepoStore.getState().loadMoreCommits(10);
    const refresh = useRepoStore
      .getState()
      .setGraphFilters({ pathFilter: "new.txt" });
    old.resolve([{ oid: "stale" }]);
    await page;
    expect(useRepoStore.getState().commits).toEqual([]);
    filtered.resolve([{ oid: "filtered" }]);
    await refresh;
    expect(useRepoStore.getState().commits).toEqual([{ oid: "filtered" }]);
    expect(useRepoStore.getState().isLoading).toBe(false);
  });
  it("does not let restoration override a tab the user selected while it was pending", async () => {
    const a = deferred(),
      b = deferred();
    invokeMock.mockImplementation((name: string, args: { path?: string }) => {
      if (name === "open_repo")
        return args.path === "/a" ? a.promise : b.promise;
      return Promise.resolve(name === "get_status" ? status : []);
    });
    useRepoStore.setState({ hasRestored: false, tabs: [] });
    const restoring = useRepoStore
      .getState()
      .restoreRepositories(["/a", "/b"], "/a");
    switchSession("/b");
    useRepoStore.setState({
      tabs: [{ id: "/b", path: "/b", name: "b", isActive: true }],
      selectedCommitOid: "user selection",
    });
    a.resolve({
      path: "/a",
      name: "a",
      headBranch: "main",
      isBare: false,
      isEmpty: false,
      state: "Clean",
    });
    b.resolve({
      path: "/b",
      name: "b",
      headBranch: "main",
      isBare: false,
      isEmpty: false,
      state: "Clean",
    });
    await restoring;
    expect(useRepoStore.getState().activeTabId).toBe("/b");
    expect(useRepoStore.getState().selectedCommitOid).toBe("user selection");
    expect(
      useRepoStore
        .getState()
        .tabs.filter((tab) => tab.isActive)
        .map((tab) => tab.path),
    ).toEqual(["/b"]);
  });
  it("invalidates an in-flight diff when the same file is selected for blame", async () => {
    const old = deferred();
    invokeMock.mockReturnValueOnce(old.promise);
    const loading = useRepoStore
      .getState()
      .selectLocalFile("unchanged.txt", false);
    useRepoStore.getState().selectFileForBlame("unchanged.txt");
    old.resolve({ tag: "obsolete diff" });
    await loading;
    expect(useRepoStore.getState().selectedFilePath).toBe("unchanged.txt");
    expect(useRepoStore.getState().localDiff).toBeNull();
    expect(useRepoStore.getState().blameLines).toEqual([]);
    expect(useRepoStore.getState().isLoading).toBe(false);
  });
});
