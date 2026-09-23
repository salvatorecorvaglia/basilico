import { beforeEach, describe, expect, it, vi } from "vitest";

// Must be mocked before the store (and its command wrappers) are imported.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import type { GraphCommit } from "../../src/lib/git-types";
import { useRepoStore } from "../../src/store/repo-store";
import {
  INITIAL_LOADING_STATES,
  PER_TAB_RESET_STATE,
} from "../../src/store/types";

const commitOf = (oid: string): GraphCommit =>
  ({
    oid,
    shortOid: oid.slice(0, 7),
    message: "msg",
    authorName: "A",
    authorEmail: "a@example.com",
    authorDate: 0,
    committerName: "A",
    committerDate: 0,
    parentOids: [],
    refs: [],
    lane: 0,
    edges: [],
  }) as unknown as GraphCommit;

/** Per-tab data that only a stale render would still be showing. */
function seedRepoAState() {
  useRepoStore.setState({
    commits: [commitOf("a".repeat(40))],
    commitDiff: [{ oldPath: "x", newPath: "x" }] as never,
    localDiff: { oldPath: "y", newPath: "y" } as never,
    rebaseTodoItems: [{ oid: "a".repeat(40), action: "pick" }] as never,
    selectedCommitOid: "a".repeat(40),
    pathFilter: "src/only-in-repo-a",
    firstParentOnly: true,
  });
}

beforeEach(() => {
  invokeMock.mockReset();
  localStorage.clear();
  useRepoStore.setState({
    tabs: [],
    activeTabId: null,
    refreshGeneration: 0,
    loadingStates: { ...INITIAL_LOADING_STATES },
    isLoading: false,
    ...PER_TAB_RESET_STATE,
  });
});

describe("activating a tab", () => {
  /**
   * `openRepository` used to set only `activeTabId` when the repository was
   * already open — no per-tab reset and no generation bump. Clicking a repo in
   * the recent list that was already in a tab therefore left the previous
   * repository's commits, diffs and rebase plan on screen, and let its in-flight
   * requests write into the newly-activated one.
   */
  it("resets per-tab state when reopening a repository that is already open", async () => {
    useRepoStore.setState({
      tabs: [
        { id: "/repo-a", path: "/repo-a", name: "a", isActive: true },
        { id: "/repo-b", path: "/repo-b", name: "b", isActive: false },
      ],
      activeTabId: "/repo-a",
    });
    seedRepoAState();
    const before = useRepoStore.getState().refreshGeneration;

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "open_repo") {
        return Promise.resolve({ path: "/repo-b", name: "b", isBare: false });
      }
      return Promise.resolve(undefined);
    });

    await useRepoStore.getState().openRepository("/repo-b");

    const s = useRepoStore.getState();
    expect(s.activeTabId).toBe("/repo-b");
    expect(s.refreshGeneration).toBeGreaterThan(before);
    // refreshAll never writes these, so only the reset can clear them.
    expect(s.commitDiff).toEqual([]);
    expect(s.localDiff).toBeNull();
    expect(s.rebaseTodoItems).toEqual([]);
    expect(s.selectedCommitOid).toBeNull();
    // isActive flags follow the active tab.
    expect(s.tabs.find((t) => t.id === "/repo-b")?.isActive).toBe(true);
    expect(s.tabs.find((t) => t.id === "/repo-a")?.isActive).toBe(false);
  });

  it("resets per-tab state when opening a repository in a new tab", async () => {
    useRepoStore.setState({
      tabs: [{ id: "/repo-a", path: "/repo-a", name: "a", isActive: true }],
      activeTabId: "/repo-a",
    });
    seedRepoAState();
    const before = useRepoStore.getState().refreshGeneration;

    // `refreshAll` re-reads repo info, so the mock has to answer that too —
    // otherwise it overwrites what we are checking with undefined.
    const info = { path: "/repo-c", name: "c", isBare: false };
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "open_repo" || cmd === "get_repo_info") {
        return Promise.resolve(info);
      }
      return Promise.resolve(undefined);
    });

    await useRepoStore.getState().openRepository("/repo-c");

    const s = useRepoStore.getState();
    expect(s.activeTabId).toBe("/repo-c");
    expect(s.refreshGeneration).toBeGreaterThan(before);
    expect(s.commitDiff).toEqual([]);
    expect(s.rebaseTodoItems).toEqual([]);
    // The freshly-opened repo's own info must survive the reset.
    expect(s.repoInfo?.path).toBe("/repo-c");
    expect(s.tabs.map((t) => t.id)).toEqual(["/repo-a", "/repo-c"]);
  });

  /**
   * The graph filters are per-tab: a path filter typed for one repository was
   * silently applied to the next one's log, with the filter box still showing
   * it.
   */
  it("clears the graph filters on switchTab", () => {
    useRepoStore.setState({
      tabs: [
        { id: "/repo-a", path: "/repo-a", name: "a", isActive: true },
        { id: "/repo-b", path: "/repo-b", name: "b", isActive: false },
      ],
      activeTabId: "/repo-a",
    });
    seedRepoAState();
    invokeMock.mockResolvedValue(undefined);

    useRepoStore.getState().switchTab("/repo-b");

    const s = useRepoStore.getState();
    expect(s.pathFilter).toBe("");
    expect(s.firstParentOnly).toBe(false);
    expect(s.hideRemoteBranches).toBe(false);
  });
});
