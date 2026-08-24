import { beforeEach, describe, expect, it, vi } from "vitest";

// Must be mocked before the store (and its command wrappers) are imported.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import type { GraphCommit } from "../../src/lib/git-types";
import { useRepoStore } from "../../src/store/repo-store";
import { INITIAL_LOADING_STATES } from "../../src/store/types";

function resetStore() {
  useRepoStore.setState({
    tabs: [],
    activeTabId: null,
    branches: [],
    tags: [],
    remotes: [],
    commits: [],
    stashes: [],
    worktrees: [],
    submodules: [],
    status: null,
    repoInfo: null,
    refreshGeneration: 0,
    hasMoreCommits: true,
    loadingStates: { ...INITIAL_LOADING_STATES },
    isLoading: false,
    isRefreshing: false,
  });
}

describe("repo store — command wiring", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetStore();
    localStorage.clear();
  });

  it("does not invoke git commands when no repository is open", async () => {
    await useRepoStore.getState().refreshStatus();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("passes the selected stash's OID so the backend can detect a shifted list", async () => {
    // Indices shift on every stash push/pop; the OID is what makes the
    // operation address the stash the user actually clicked.
    useRepoStore.setState({
      activeTabId: "/repo",
      stashes: [
        { index: 0, name: "stash@{0}", oid: "aaa111", message: "first" },
        { index: 1, name: "stash@{1}", oid: "bbb222", message: "second" },
      ],
    });
    invokeMock.mockResolvedValue(undefined);

    await useRepoStore.getState().dropStash(1);

    const dropCall = invokeMock.mock.calls.find((c) => c[0] === "drop_stash");
    expect(dropCall?.[1]).toMatchObject({
      path: "/repo",
      index: 1,
      expectedOid: "bbb222",
    });
  });

  it("sends a null OID when the index is not in the known stash list", async () => {
    useRepoStore.setState({ activeTabId: "/repo", stashes: [] });
    invokeMock.mockResolvedValue(undefined);

    await useRepoStore.getState().dropStash(3);

    const dropCall = invokeMock.mock.calls.find((c) => c[0] === "drop_stash");
    expect(dropCall?.[1]).toMatchObject({ expectedOid: null });
  });
});

describe("repo store — stale response handling", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetStore();
    localStorage.clear();
  });

  it("discards a commit list that arrives after the tab changed", async () => {
    useRepoStore.setState({ activeTabId: "/repo-a", commits: [] });

    let releaseGetLog: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      releaseGetLog = resolve;
    });

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_log") return pending;
      return Promise.resolve([]);
    });

    const inFlight = useRepoStore.getState().loadMoreCommits(100);

    // Simulate a tab switch while the request is outstanding.
    useRepoStore.setState({
      activeTabId: "/repo-b",
      refreshGeneration: useRepoStore.getState().refreshGeneration + 1,
    });

    releaseGetLog([
      { oid: "stale", shortOid: "stale", message: "from the old tab" },
    ]);
    await inFlight;

    expect(useRepoStore.getState().commits).toEqual([]);
  });

  // Search briefly lost this guard: a refactor split `searchCommits`/`grepCode`
  // into their own slice, which — because slices are merged by spread and the
  // new one spread later — silently replaced the generation-checked versions
  // with copies that wrote unconditionally.
  it.each([
    ["searchCommits", "search_commits", "commitSearchResults"],
    ["grepCode", "grep_code", "grepSearchResults"],
  ] as const)(
    "discards %s results that arrive after the tab changed",
    async (action, command, resultKey) => {
      useRepoStore.setState({ activeTabId: "/repo-a", [resultKey]: [] });

      let release: (value: unknown) => void = () => {};
      const pending = new Promise((resolve) => {
        release = resolve;
      });

      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === command) return pending;
        return Promise.resolve([]);
      });

      const inFlight = useRepoStore.getState()[action]("needle");

      useRepoStore.setState({
        activeTabId: "/repo-b",
        refreshGeneration: useRepoStore.getState().refreshGeneration + 1,
      });

      release([{ oid: "stale", shortOid: "stale", message: "old tab" }]);
      await inFlight;

      expect(useRepoStore.getState()[resultKey]).toEqual([]);
    },
  );

  it.each([
    ["searchCommits", "search_commits", "commitSearchResults"],
    ["grepCode", "grep_code", "grepSearchResults"],
  ] as const)(
    "applies %s results that arrive while the tab is unchanged",
    async (action, command, resultKey) => {
      useRepoStore.setState({ activeTabId: "/repo-a", [resultKey]: [] });
      const fresh = [{ oid: "abc", shortOid: "abc", message: "current tab" }];

      invokeMock.mockImplementation((cmd: string) =>
        Promise.resolve(cmd === command ? fresh : []),
      );

      await useRepoStore.getState()[action]("needle");

      expect(useRepoStore.getState()[resultKey]).toEqual(fresh);
    },
  );

  it("applies a commit list that arrives while the tab is unchanged", async () => {
    useRepoStore.setState({ activeTabId: "/repo-a", commits: [] });
    const fresh = [{ oid: "abc", shortOid: "abc", message: "current tab" }];
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_log" ? Promise.resolve(fresh) : Promise.resolve([]),
    );

    await useRepoStore.getState().loadMoreCommits(100);

    expect(useRepoStore.getState().commits).toEqual(fresh);
  });

  // selectCommit used to guard only on refreshGeneration (tab identity), so
  // clicking commit A then quickly commit B in the *same* tab let A's
  // late-arriving diff clobber B's once A finally resolved.
  it("discards a commit diff for a commit that's no longer selected", async () => {
    useRepoStore.setState({
      activeTabId: "/repo-a",
      selectedCommitOid: null,
      commitDiff: [],
    });

    let releaseA: (value: unknown) => void = () => {};
    const pendingA = new Promise((resolve) => {
      releaseA = resolve;
    });

    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "get_commit_diff" && args?.oid === "commit-a") {
          return pendingA;
        }
        if (cmd === "get_commit_diff" && args?.oid === "commit-b") {
          return Promise.resolve([{ newPath: "b.txt" }]);
        }
        return Promise.resolve([]);
      },
    );

    const inFlightA = useRepoStore.getState().selectCommit("commit-a");
    // Select a different commit in the same tab before A's diff resolves.
    await useRepoStore.getState().selectCommit("commit-b");

    releaseA([{ newPath: "a.txt" }]);
    await inFlightA;

    expect(useRepoStore.getState().selectedCommitOid).toBe("commit-b");
    expect(useRepoStore.getState().commitDiff).toEqual([{ newPath: "b.txt" }]);
  });
});

describe("repo store — commit pagination", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetStore();
    localStorage.clear();
  });

  const commit = (oid: string): GraphCommit => ({
    oid,
    shortOid: oid,
    message: oid,
    authorName: "T",
    authorEmail: "t@t.t",
    authorDate: 0,
    committerName: "T",
    committerDate: 0,
    parentOids: [],
    refs: [],
    lane: 0,
    edges: [],
  });

  it("appends the next page instead of refetching everything", async () => {
    useRepoStore.setState({
      activeTabId: "/repo",
      commits: [commit("a"), commit("b")],
    });
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_log"
        ? Promise.resolve([commit("c"), commit("d")])
        : Promise.resolve([]),
    );

    await useRepoStore.getState().loadMoreCommits(2);

    // The already-loaded commits are kept; only the new page was requested.
    expect(useRepoStore.getState().commits.map((c) => c.oid)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    const call = invokeMock.mock.calls.find((c) => c[0] === "get_log");
    expect(call?.[1]).toMatchObject({ skip: 2, maxCommits: 2 });
  });

  it("stops paging once a short page comes back", async () => {
    useRepoStore.setState({ activeTabId: "/repo", commits: [commit("a")] });
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_log" ? Promise.resolve([commit("b")]) : Promise.resolve([]),
    );

    await useRepoStore.getState().loadMoreCommits(10);
    expect(useRepoStore.getState().hasMoreCommits).toBe(false);

    // Further scrolling must not keep hammering the backend at the end of history.
    invokeMock.mockClear();
    await useRepoStore.getState().loadMoreCommits(10);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("drops overlapping commits if history shifted under the cursor", async () => {
    useRepoStore.setState({
      activeTabId: "/repo",
      commits: [commit("a"), commit("b")],
    });
    // "b" repeats because the page boundary moved; duplicate keys would break
    // the virtualised list.
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_log"
        ? Promise.resolve([commit("b"), commit("c")])
        : Promise.resolve([]),
    );

    await useRepoStore.getState().loadMoreCommits(2);
    expect(useRepoStore.getState().commits.map((c) => c.oid)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  // A mutating action (checkout, commit, push, ...) triggers a refresh that
  // re-fetches from the top. If that always asked for the default page size,
  // a user who had scrolled past it via loadMoreCommits would silently lose
  // everything beyond it on the very next action.
  it("refreshCommitsAndStatus requests at least as many commits as are already loaded", async () => {
    const loaded = Array.from({ length: 650 }, (_, i) => commit(String(i)));
    useRepoStore.setState({ activeTabId: "/repo", commits: loaded });
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_log" || cmd === "get_status"
        ? Promise.resolve(cmd === "get_log" ? loaded : null)
        : Promise.resolve([]),
    );

    await useRepoStore.getState().refreshCommitsAndStatus();

    const call = invokeMock.mock.calls.find((c) => c[0] === "get_log");
    expect(call?.[1]).toMatchObject({ maxCommits: 650 });
  });

  it("refreshAll requests at least as many commits as are already loaded", async () => {
    const loaded = Array.from({ length: 650 }, (_, i) => commit(String(i)));
    useRepoStore.setState({ activeTabId: "/repo", commits: loaded });
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_log" ? Promise.resolve(loaded) : Promise.resolve([]),
    );

    await useRepoStore.getState().refreshAll();

    const call = invokeMock.mock.calls.find((c) => c[0] === "get_log");
    expect(call?.[1]).toMatchObject({ maxCommits: 650 });
  });

  it("still requests the default page size when fewer commits were loaded", async () => {
    useRepoStore.setState({
      activeTabId: "/repo",
      commits: [commit("a"), commit("b")],
    });
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_log" ? Promise.resolve([commit("a")]) : Promise.resolve([]),
    );

    await useRepoStore.getState().refreshAll();

    const call = invokeMock.mock.calls.find((c) => c[0] === "get_log");
    expect(call?.[1]).toMatchObject({ maxCommits: 500 });
  });
});

describe("repo store — tab switch/close clears per-tab state", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([]);
    resetStore();
    localStorage.clear();
  });

  const commit = (oid: string): GraphCommit => ({
    oid,
    shortOid: oid,
    message: oid,
    authorName: "T",
    authorEmail: "t@t.t",
    authorDate: 0,
    committerName: "T",
    committerDate: 0,
    parentOids: [],
    refs: [],
    lane: 0,
    edges: [],
  });

  // A rebase plan or bisect session staged against one repo must never be
  // usable against another — startRebase/markBisect act on whatever is in
  // the store for the *current* activeTabId, regardless of which tab it was
  // built for.
  function dirtyPerTabState() {
    useRepoStore.setState({
      rebaseTodoItems: [{ action: "pick", oid: "abc", summary: "do a thing" }],
      rebaseStatus: {
        status: "planning",
        currentOid: null,
        message: "in progress",
      },
      rebaseUpstream: "main",
      bisectState: {
        isBisecting: true,
        message: "bisecting",
        currentOid: "abc",
        stepsRemaining: 3,
      },
      commitSearchResults: [commit("search-hit")],
      grepSearchResults: [
        { filePath: "a.ts", lineNumber: 1, content: "needle" },
      ],
    });
  }

  it("clears rebase/bisect/search state left over from the previous tab on switchTab", () => {
    useRepoStore.setState({
      tabs: [
        { id: "/repo-a", path: "/repo-a", name: "a", isActive: true },
        { id: "/repo-b", path: "/repo-b", name: "b", isActive: false },
      ],
      activeTabId: "/repo-a",
    });
    dirtyPerTabState();

    useRepoStore.getState().switchTab("/repo-b");

    const state = useRepoStore.getState();
    expect(state.rebaseTodoItems).toEqual([]);
    expect(state.rebaseStatus).toBeNull();
    expect(state.rebaseUpstream).toBeNull();
    expect(state.bisectState).toBeNull();
    expect(state.commitSearchResults).toEqual([]);
    expect(state.grepSearchResults).toEqual([]);
  });

  it("clears rebase/bisect/search state left over from the closed tab on closeTab", () => {
    useRepoStore.setState({
      tabs: [
        { id: "/repo-a", path: "/repo-a", name: "a", isActive: true },
        { id: "/repo-b", path: "/repo-b", name: "b", isActive: false },
      ],
      activeTabId: "/repo-a",
    });
    dirtyPerTabState();

    useRepoStore.getState().closeTab("/repo-a");

    const state = useRepoStore.getState();
    expect(state.rebaseTodoItems).toEqual([]);
    expect(state.rebaseStatus).toBeNull();
    expect(state.rebaseUpstream).toBeNull();
    expect(state.bisectState).toBeNull();
    expect(state.commitSearchResults).toEqual([]);
    expect(state.grepSearchResults).toEqual([]);
  });
});

describe("repo store — opening repositories", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([]);
    resetStore();
    localStorage.clear();
  });

  function repoInfo(path: string) {
    return {
      path,
      name: path,
      headBranch: "main",
      isBare: false,
      isEmpty: false,
      state: "Clean",
    };
  }

  it("only calls open_repo once for two concurrent opens of the same path", async () => {
    let releaseOpen: (value: unknown) => void = () => {};
    const pendingOpen = new Promise((resolve) => {
      releaseOpen = resolve;
    });

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "open_repo") return pendingOpen;
      return Promise.resolve([]);
    });

    const first = useRepoStore.getState().openRepository("/repo-a");
    const second = useRepoStore.getState().openRepository("/repo-a");

    releaseOpen(repoInfo("/repo-a"));
    await Promise.all([first, second]);

    expect(
      invokeMock.mock.calls.filter((c) => c[0] === "open_repo"),
    ).toHaveLength(1);
    expect(useRepoStore.getState().tabs.map((t) => t.id)).toEqual(["/repo-a"]);
  });

  it("keeps a repository opened by hand while restoration is still in flight", async () => {
    let releaseRestoreOpen: (value: unknown) => void = () => {};
    const pendingRestoreOpen = new Promise((resolve) => {
      releaseRestoreOpen = resolve;
    });

    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "open_repo" && args?.path === "/restored") {
          return pendingRestoreOpen;
        }
        if (cmd === "open_repo" && args?.path === "/manual") {
          return Promise.resolve(repoInfo("/manual"));
        }
        return Promise.resolve([]);
      },
    );

    const restoring = useRepoStore
      .getState()
      .restoreRepositories(["/restored"], "/restored");

    // A manual open completes entirely while restoration is still waiting on
    // its own open_repo call.
    await useRepoStore.getState().openRepository("/manual");
    expect(useRepoStore.getState().tabs.map((t) => t.id)).toEqual(["/manual"]);

    releaseRestoreOpen(repoInfo("/restored"));
    await restoring;

    // The previous unconditional `set` in restoreRepositories was built only
    // from its own accumulator and would have overwritten /manual here.
    const tabIds = useRepoStore
      .getState()
      .tabs.map((t) => t.id)
      .sort();
    expect(tabIds).toEqual(["/manual", "/restored"]);
    // The manually-opened tab is a more recent, deliberate choice than the
    // persisted one, so it keeps focus.
    expect(useRepoStore.getState().activeTabId).toBe("/manual");
  });
});
