import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { Sidebar } from "../../../src/components/layout/Sidebar";
import type {
  BranchInfo,
  RemoteInfo,
  StashInfo,
  SubmoduleInfo,
  TagInfo,
  WorktreeInfo,
} from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";

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
    name: "origin/main",
    isHead: false,
    isRemote: true,
    upstream: null,
    ahead: 0,
    behind: 0,
    oid: "abc123",
  },
];

const REMOTES: RemoteInfo[] = [
  { name: "origin", url: "https://example.com/repo.git", pushUrl: null },
];

const TAGS: TagInfo[] = [
  {
    name: "v1.0.0",
    oid: "abc123",
    message: null,
    tagger: null,
    isAnnotated: false,
  },
];

const STASHES: StashInfo[] = [
  { index: 0, name: "stash@{0}", oid: "def456", message: "WIP" },
];

const WORKTREES: WorktreeInfo[] = [
  { path: "/repo-wt", name: "repo-wt", head: "abc123", branch: "feature" },
];

const SUBMODULES: SubmoduleInfo[] = [
  {
    name: "vendor/lib",
    path: "vendor/lib",
    url: "https://example.com/lib.git",
    headOid: "abc123",
    status: "up-to-date",
  },
];

describe("Sidebar", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  // Sidebar delegates to useBranchTree/useRemoteTree/etc., which internally
  // call hooks (useState/useMemo/store selectors). Those calls must happen on
  // every render, never only after the loading guard clears — otherwise
  // React sees a different number of hooks between the loading and loaded
  // renders and throws "Rendered more hooks than during the previous
  // render", crashing the whole app on the first repository open.
  it("does not throw when transitioning from the loading skeleton to loaded data", () => {
    useRepoStore.setState({
      isLoading: true,
      branches: [],
      tags: [],
      remotes: [],
      stashes: [],
      worktrees: [],
      submodules: [],
    });

    render(<Sidebar />);

    expect(() => {
      act(() => {
        useRepoStore.setState({
          isLoading: false,
          branches: BRANCHES,
          tags: TAGS,
          remotes: REMOTES,
          stashes: STASHES,
          worktrees: WORKTREES,
          submodules: SUBMODULES,
        });
      });
    }).not.toThrow();
  });

  it("renders branch/tag/remote/stash/worktree/submodule sections once loaded", async () => {
    useRepoStore.setState({
      isLoading: false,
      branches: BRANCHES,
      tags: TAGS,
      remotes: REMOTES,
      stashes: STASHES,
      worktrees: WORKTREES,
      submodules: SUBMODULES,
    });

    render(<Sidebar />);

    expect(await screen.findByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("Remotes")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Stashes")).toBeInTheDocument();
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
    expect(screen.getByText("Submodules")).toBeInTheDocument();
  });
});
