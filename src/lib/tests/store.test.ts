import { beforeEach, describe, expect, it } from "vitest";
import { useRepoStore } from "../../store/repo-store";

describe("RepoStore Unit Tests", () => {
  beforeEach(() => {
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
      loadingStates: {
        global: false,
        commits: false,
        status: false,
        diff: false,
        staging: false,
        branches: false,
        blame: false,
        history: false,
        stashes: false,
        search: false,
        collaboration: false,
        settings: false,
      },
      isLoading: false,
      error: null,
    });
  });

  it("should initialize with default store state", () => {
    const state = useRepoStore.getState();
    expect(state.tabs).toEqual([]);
    expect(state.activeTabId).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.branches).toEqual([]);
  });

  it("should handle setting tab state correctly", () => {
    useRepoStore.setState({
      tabs: [
        {
          id: "/path/to/repo1",
          name: "repo1",
          path: "/path/to/repo1",
          isActive: true,
        },
      ],
      activeTabId: "/path/to/repo1",
    });

    const state = useRepoStore.getState();
    expect(state.tabs.length).toBe(1);
    expect(state.activeTabId).toBe("/path/to/repo1");
  });

  it("should manage filter flags cleanly", async () => {
    expect(useRepoStore.getState().firstParentOnly).toBe(false);

    useRepoStore.setState({ firstParentOnly: true, hideRemoteBranches: true });

    const state = useRepoStore.getState();
    expect(state.firstParentOnly).toBe(true);
    expect(state.hideRemoteBranches).toBe(true);
  });
});
