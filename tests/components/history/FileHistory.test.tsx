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

import { FileHistory } from "../../../src/components/history/FileHistory";
import type { FileHistoryEntry } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const entry = (
  oid: string,
  summary: string,
  filePath = "src/new.ts",
): FileHistoryEntry => ({
  commitOid: oid.repeat(40),
  shortOid: oid.repeat(7),
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 0,
  commitSummary: summary,
  filePath,
});

// Newest first: an edit, the rename, then the commit that added the file.
const HISTORY = [
  entry("c", "edit after rename"),
  entry("b", "rename old.ts to new.ts"),
  entry("a", "add old.ts", "src/old.ts"),
];

/** File content keyed by `<path>@<revision>`; anything else does not exist. */
const CONTENT: Record<string, string> = {
  [`src/new.ts@${"c".repeat(40)}`]: "v3",
  [`src/new.ts@${"c".repeat(40)}^`]: "v2",
  [`src/new.ts@${"b".repeat(40)}`]: "v2",
  [`src/old.ts@${"b".repeat(40)}^`]: "v1",
  [`src/old.ts@${"a".repeat(40)}`]: "v1",
};

describe("FileHistory", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(
      (cmd: string, args: { filePath: string; revision: string }) => {
        if (cmd !== "get_file_content_at_revision") {
          return Promise.resolve(undefined);
        }
        const content = CONTENT[`${args.filePath}@${args.revision}`];
        return content === undefined
          ? Promise.reject(new Error("path not found in tree"))
          : Promise.resolve(content);
      },
    );
    useRepoStore.setState({
      activeTabId: "/repo",
      selectedFilePath: "src/new.ts",
      fileHistory: HISTORY,
      loadFileHistory: vi.fn().mockResolvedValue(undefined),
      isLoading: false,
    });
    useUIStore.setState({ notifications: [], activeView: "history" });
  });

  it("selects the newest commit and diffs it against its parent", async () => {
    render(<FileHistory />);

    expect(useRepoStore.getState().loadFileHistory).toHaveBeenCalledWith(
      "src/new.ts",
    );
    await waitFor(() =>
      expect(screen.getByTestId("diff-modified")).toHaveTextContent("v3"),
    );
    expect(screen.getByTestId("diff-original")).toHaveTextContent("v2");
    expect(
      screen.getByRole("button", { name: /edit after rename/ }),
    ).toHaveAttribute("aria-current", "true");
  });

  // Regression: the parent of the renaming commit was read under the new
  // name, which does not exist there, so the whole file showed as added.
  it("reads the parent of a rename under the file's old name", async () => {
    const user = userEvent.setup();
    render(<FileHistory />);

    await user.click(screen.getByRole("button", { name: /rename old.ts/ }));
    await waitFor(() =>
      expect(screen.getByTestId("diff-modified")).toHaveTextContent("v2"),
    );
    expect(screen.getByTestId("diff-original")).toHaveTextContent("v1");
  });

  it("flags entries recorded under an earlier name", () => {
    render(<FileHistory />);
    expect(screen.getAllByText(/\(renamed\)/)).toHaveLength(1);
  });

  // Regression: the commit that added the file has no parent version, and the
  // expected lookup failure raised an error toast.
  it("shows the adding commit as all-new without an error toast", async () => {
    const user = userEvent.setup();
    render(<FileHistory />);

    await user.click(screen.getByRole("button", { name: /add old.ts/ }));
    await waitFor(() =>
      expect(screen.getByTestId("diff-modified")).toHaveTextContent("v1"),
    );
    expect(screen.getByTestId("diff-original")).toHaveTextContent("");
    expect(useUIStore.getState().notifications).toEqual([]);
  });

  it("offers a way back when no file is selected", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({ selectedFilePath: null });
    render(<FileHistory />);

    await user.click(screen.getByRole("button", { name: "Back to Graph" }));
    expect(useUIStore.getState().activeView).toBe("graph");
  });
});
