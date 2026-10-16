import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));
vi.mock("@monaco-editor/react", () => ({
  DiffEditor: (props: { original: string; modified: string }) => (
    <div data-testid="diff-editor">
      <span data-testid="diff-original">{props.original}</span>
      <span data-testid="diff-modified">{props.modified}</span>
    </div>
  ),
}));
vi.mock("../../../src/lib/monaco-setup", () => ({
  disposeModelsOnUnmount: () => {},
}));
vi.mock("../../../src/lib/use-dark-mode", () => ({ useDarkMode: () => false }));

import { StashInspector } from "../../../src/components/staging/StashInspector";
import type { FileDiff, StashInfo } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const STASH: StashInfo = {
  index: 1,
  name: "stash@{1}",
  oid: "5".repeat(40),
  message: "WIP on main: tweak parser",
};

const diff = (path: string, status: string): FileDiff => ({
  oldPath: path,
  newPath: path,
  status,
  hunks: [],
  stats: { additions: 1, deletions: 0 },
  isBinary: false,
});

const argsOf = (cmd: string) =>
  invokeMock.mock.calls.filter((c) => c[0] === cmd).pop()?.[1];

describe("StashInspector", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ original: "base", modified: "stashed" });
    useRepoStore.setState({
      activeTabId: "/repo",
      stashes: [STASH],
      selectedStashIndex: 1,
      stashDiff: [diff("src/a.ts", "modified"), diff("notes.txt", "untracked")],
      selectedStashFile: null,
      selectedStashFileDiff: null,
      selectStashFile: vi.fn(async (file: string | null) => {
        useRepoStore.setState({
          selectedStashFile: file,
          selectedStashFileDiff:
            useRepoStore.getState().stashDiff.find((d) => d.newPath === file) ??
            null,
        });
      }),
      applyStash: vi.fn().mockResolvedValue(undefined),
      popStash: vi.fn().mockResolvedValue(undefined),
      dropStash: vi.fn().mockResolvedValue(undefined),
      createBranchFromStash: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({
      activeView: "stash-inspector",
      notifications: [],
      confirmOptions: null,
      promptOptions: null,
    });
  });

  it("asks for a stash when none is selected", () => {
    useRepoStore.setState({ selectedStashIndex: null });
    render(<StashInspector />);
    expect(screen.getByText("No Stash Selected")).toBeInTheDocument();
  });

  it("diffs a stashed tracked file against the stash's base commit", async () => {
    const user = userEvent.setup();
    render(<StashInspector />);

    await user.click(screen.getByTitle("src/a.ts"));
    await waitFor(() =>
      expect(screen.getByTestId("diff-modified")).toHaveTextContent("stashed"),
    );
    expect(argsOf("get_file_content_pair_revisions")).toMatchObject({
      filePath: "src/a.ts",
      base: `${STASH.oid}^1`,
      target: STASH.oid,
    });
  });

  it("reads a stashed untracked file from the stash's untracked commit", async () => {
    const user = userEvent.setup();
    render(<StashInspector />);

    await user.click(screen.getByTitle("notes.txt"));
    await waitFor(() =>
      expect(argsOf("get_file_content_pair_revisions")).toMatchObject({
        filePath: "notes.txt",
        base: "",
        target: `${STASH.oid}^3`,
      }),
    );
  });

  it("applies and pops the selected stash, then returns to the graph", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<StashInspector />);

    await user.click(screen.getByTitle(/keep the stash in list/));
    expect(useRepoStore.getState().applyStash).toHaveBeenCalledWith(1);
    await waitFor(() => expect(useUIStore.getState().activeView).toBe("graph"));
    unmount();

    useUIStore.setState({ activeView: "stash-inspector" });
    render(<StashInspector />);
    await user.click(screen.getByTitle(/remove from stash list/));
    expect(useRepoStore.getState().popStash).toHaveBeenCalledWith(1);
  });

  it("drops a stash only after confirmation", async () => {
    const user = userEvent.setup();
    render(<StashInspector />);

    await user.click(screen.getByTitle(/Discard this stash entry/));
    expect(useRepoStore.getState().dropStash).not.toHaveBeenCalled();

    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.isDanger).toBe(true);
    await confirm?.onConfirm();
    expect(useRepoStore.getState().dropStash).toHaveBeenCalledWith(1);
  });

  it("creates a branch from the stash with the trimmed name", async () => {
    const user = userEvent.setup();
    render(<StashInspector />);

    await user.click(screen.getByTitle(/Create branch from the stash/));
    const prompt = useUIStore.getState().promptOptions;
    await prompt?.onSubmit({ branchName: "  rescue  " });
    expect(useRepoStore.getState().createBranchFromStash).toHaveBeenCalledWith(
      1,
      "rescue",
    );
  });

  it("keeps the inspector open and reports a failed pop", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({
      popStash: vi.fn().mockRejectedValue(new Error("conflicts")),
    });
    render(<StashInspector />);

    await user.click(screen.getByTitle(/remove from stash list/));
    await waitFor(() =>
      expect(
        useUIStore.getState().notifications.some((n) => n.type === "error"),
      ).toBe(true),
    );
    expect(useUIStore.getState().activeView).toBe("stash-inspector");
  });
});
