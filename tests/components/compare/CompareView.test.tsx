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

import { CompareView } from "../../../src/components/compare/CompareView";
import type { FileDiff } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const diff = (over: Partial<FileDiff>): FileDiff => ({
  oldPath: "a.ts",
  newPath: "a.ts",
  status: "modified",
  hunks: [],
  stats: { additions: 1, deletions: 1 },
  isBinary: false,
  ...over,
});

const MODIFIED = diff({});
const RENAMED = diff({
  oldPath: "lib/old.ts",
  newPath: "lib/new.ts",
  status: "renamed",
});

const argsOf = (cmd: string) =>
  invokeMock.mock.calls.filter((c) => c[0] === cmd).pop()?.[1];

describe("CompareView", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_file_content_pair_revisions"
        ? Promise.resolve({ original: "before", modified: "after" })
        : Promise.resolve(undefined),
    );
    useRepoStore.setState({
      activeTabId: "/repo",
      compareBase: "main",
      compareTarget: "feature",
      compareDiff: [MODIFIED, RENAMED],
      selectedCompareFile: null,
      compareFileDiff: null,
      selectCompareFile: vi.fn(async (file: string | null) => {
        useRepoStore.setState({ selectedCompareFile: file });
      }),
      startComparison: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({ activeView: "compare", notifications: [] });
  });

  it("shows an empty state when nothing is being compared", () => {
    useRepoStore.setState({ compareBase: null, compareTarget: null });
    render(<CompareView />);
    expect(screen.getByText("No Comparison Active")).toBeInTheDocument();
  });

  it("lists the changed files and says when there are none", () => {
    const { unmount } = render(<CompareView />);
    expect(screen.getByText("new.ts")).toBeInTheDocument();
    unmount();

    useRepoStore.setState({ compareDiff: [] });
    render(<CompareView />);
    expect(screen.getByText("No Differences")).toBeInTheDocument();
  });

  it("loads the selected file at both revisions", async () => {
    const user = userEvent.setup();
    render(<CompareView />);

    await user.click(screen.getByText("a.ts"));
    await waitFor(() =>
      expect(screen.getByTestId("diff-modified")).toHaveTextContent("after"),
    );
    expect(argsOf("get_file_content_pair_revisions")).toEqual({
      path: "/repo",
      filePath: "a.ts",
      base: "main",
      target: "feature",
      basePath: null,
    });
  });

  // Regression: the base side was read under the new name, found nothing,
  // and the editor showed the whole renamed file as added.
  it("reads a renamed file's base side under its old name", async () => {
    useRepoStore.setState({ selectedCompareFile: "lib/new.ts" });
    render(<CompareView />);

    await waitFor(() =>
      expect(argsOf("get_file_content_pair_revisions")).toMatchObject({
        filePath: "lib/new.ts",
        basePath: "lib/old.ts",
      }),
    );
  });

  it("shows a placeholder for a file too large to display", async () => {
    invokeMock.mockResolvedValue({
      original: "",
      modified: "",
      isBinary: false,
      tooLarge: true,
    });
    useRepoStore.setState({ selectedCompareFile: "a.ts" });
    render(<CompareView />);

    expect(
      await screen.findByText("This file is too large to display."),
    ).toBeInTheDocument();
  });

  it("swaps the comparison direction", async () => {
    const user = userEvent.setup();
    render(<CompareView />);

    await user.click(screen.getByTitle("Swap comparison direction"));
    expect(useRepoStore.getState().startComparison).toHaveBeenCalledWith(
      "feature",
      "main",
    );
  });

  it("exits back to the graph", async () => {
    const user = userEvent.setup();
    render(<CompareView />);

    await user.click(screen.getByTitle("Exit comparison"));
    expect(useUIStore.getState().activeView).toBe("graph");
  });
});
