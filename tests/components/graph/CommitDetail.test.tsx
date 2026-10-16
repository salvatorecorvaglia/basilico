import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { CommitDetail } from "../../../src/components/graph/CommitDetail";
import type {
  FileDiff,
  GraphCommit,
  SignatureInfo,
} from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const commit = (oid: string, parentOids: string[]): GraphCommit => ({
  oid: oid.repeat(40),
  shortOid: oid.repeat(7),
  message: `commit ${oid}`,
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 0,
  committerName: "Ada",
  committerDate: 0,
  parentOids,
  refs: [],
  lane: 0,
  edges: [],
});

const CHILD = commit("2", ["1".repeat(40)]);
const ROOT = commit("1", []);

const CHANGE: FileDiff = {
  oldPath: "src/app.ts",
  newPath: "src/app.ts",
  status: "modified",
  hunks: [],
  stats: { additions: 3, deletions: 1 },
  isBinary: false,
};

const signature = (status: string): SignatureInfo => ({
  signature: "",
  payload: "",
  status,
  keyId: "KEY",
  signer: "Ada",
});

describe("CommitDetail", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
    useRepoStore.setState({
      activeTabId: "/repo",
      commits: [CHILD, ROOT],
      selectedCommitOid: CHILD.oid,
      commitDiff: [CHANGE],
      commitTree: [],
      isLoading: false,
      loadCommitTree: vi.fn().mockResolvedValue(undefined),
      startComparison: vi.fn().mockResolvedValue(undefined),
      selectCompareFile: vi.fn().mockResolvedValue(undefined),
      selectLocalFile: vi.fn().mockResolvedValue(undefined),
      createTag: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({
      activeView: "graph",
      promptOptions: null,
      notifications: [],
    });
  });

  it("asks for a selection when no commit is selected", () => {
    useRepoStore.setState({ selectedCommitOid: null });
    render(<CommitDetail />);
    expect(
      screen.getByText("Select a commit to view details"),
    ).toBeInTheDocument();
  });

  it("shows the commit's metadata and changed files", () => {
    render(<CommitDetail />);
    expect(screen.getByText("commit 2")).toBeInTheDocument();
    expect(screen.getByText(CHILD.oid)).toBeInTheDocument();
    expect(screen.getByText("1111111")).toBeInTheDocument(); // parent
    expect(screen.getByText("Changes (1)")).toBeInTheDocument();
    expect(screen.getByText("app.ts")).toBeInTheDocument();
  });

  // Regression: clicking a changed file opened its *working-tree* diff in
  // Staging, which has nothing to do with the commit being inspected.
  it("opens what the commit changed in the file, not the local diff", async () => {
    const user = userEvent.setup();
    render(<CommitDetail />);

    await user.click(screen.getByText("app.ts"));
    expect(useRepoStore.getState().startComparison).toHaveBeenCalledWith(
      "1".repeat(40),
      CHILD.oid,
    );
    await waitFor(() =>
      expect(useRepoStore.getState().selectCompareFile).toHaveBeenCalledWith(
        "src/app.ts",
      ),
    );
    expect(useRepoStore.getState().selectLocalFile).not.toHaveBeenCalled();
    expect(useUIStore.getState().activeView).toBe("compare");
  });

  it("compares a root commit against the empty tree", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({ selectedCommitOid: ROOT.oid });
    render(<CommitDetail />);

    await user.click(screen.getByText("app.ts"));
    expect(useRepoStore.getState().startComparison).toHaveBeenCalledWith(
      "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
      ROOT.oid,
    );
  });

  it("creates a tag at the commit, with a null message when left empty", async () => {
    const user = userEvent.setup();
    render(<CommitDetail />);

    await user.click(screen.getByTitle("Create Tag at this commit"));
    await useUIStore
      .getState()
      .promptOptions?.onSubmit({ name: " v1.0 ", message: "  " });
    expect(useRepoStore.getState().createTag).toHaveBeenCalledWith(
      "v1.0",
      CHILD.oid,
      null,
    );
  });

  it("loads the file tree lazily, and resets to Changes on a new commit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CommitDetail />);
    expect(useRepoStore.getState().loadCommitTree).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /File Tree/ }));
    expect(useRepoStore.getState().loadCommitTree).toHaveBeenCalledWith(
      CHILD.oid,
    );

    act(() => {
      useRepoStore.setState({ selectedCommitOid: ROOT.oid });
    });
    rerender(<CommitDetail />);
    expect(screen.getByText("app.ts")).toBeInTheDocument();
  });

  it("shows the signature badge for the selected commit", async () => {
    invokeMock.mockResolvedValue(signature("Verified"));
    render(<CommitDetail />);
    expect(
      await screen.findByRole("img", { name: /Signature Verified/ }),
    ).toBeInTheDocument();
  });

  // Regression: an earlier commit's slow lookup could land last and badge the
  // current commit with the wrong signature.
  it("ignores a signature that arrives after moving to another commit", async () => {
    let releaseFirst: (v: SignatureInfo) => void = () => {};
    invokeMock.mockImplementation((_cmd: string, args: { oidStr: string }) =>
      args.oidStr === CHILD.oid
        ? new Promise((r) => {
            releaseFirst = r;
          })
        : Promise.resolve(null),
    );
    const { rerender } = render(<CommitDetail />);

    act(() => {
      useRepoStore.setState({ selectedCommitOid: ROOT.oid });
    });
    rerender(<CommitDetail />);
    await act(async () => {
      releaseFirst(signature("Verified"));
    });

    expect(screen.getByText("commit 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Signature/ }),
    ).not.toBeInTheDocument();
  });

  // The tree is listed one folder at a time: the root from the store, deeper
  // folders fetched when first expanded (and only then).
  it("fetches a folder's contents only when it is expanded", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((cmd: string, args: { dir?: string }) =>
      cmd === "get_commit_tree" && args.dir === "src"
        ? Promise.resolve([
            { path: "src/main.ts", name: "main.ts", isDir: false, size: 2048 },
          ])
        : Promise.resolve(null),
    );
    useRepoStore.setState({
      commitTree: [
        { path: "src", name: "src", isDir: true, size: null },
        { path: "README.md", name: "README.md", isDir: false, size: 10 },
      ],
    });
    render(<CommitDetail />);

    await user.click(screen.getByRole("button", { name: /File Tree/ }));
    expect(screen.getByText("README.md")).toBeInTheDocument();
    const treeCalls = () =>
      invokeMock.mock.calls.filter((c) => c[0] === "get_commit_tree");
    expect(treeCalls()).toHaveLength(0);

    const folder = screen
      .getByText("src")
      .closest("[role=button]") as HTMLElement;
    await user.click(folder);
    expect(await screen.findByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(treeCalls()[0][1]).toMatchObject({ oid: CHILD.oid, dir: "src" });

    // Collapsing and re-expanding reuses what was fetched.
    await user.click(folder);
    await user.click(folder);
    expect(treeCalls()).toHaveLength(1);
    expect(folder).toHaveAttribute("aria-expanded", "true");
  });
});
