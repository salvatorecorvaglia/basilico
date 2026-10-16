import { render, screen, waitFor } from "@testing-library/react";
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

// Registers real Monaco workers via Vite's `?worker` imports, which have no
// meaning under Vitest/jsdom — the diff view only needs the DiffEditor stub.
vi.mock("../../../src/lib/monaco-setup", () => ({}));
vi.mock("../../../src/lib/use-dark-mode", () => ({ useDarkMode: () => false }));

const getFileContentPairMock = vi.fn();
vi.mock("../../../src/lib/tauri-commands", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/lib/tauri-commands")>();
  return {
    ...actual,
    getFileContentPair: (...args: unknown[]) => getFileContentPairMock(...args),
  };
});

import { DiffView } from "../../../src/components/diff/DiffView";
import type { FileContentPair } from "../../../src/lib/tauri-commands";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

function makeDeferred() {
  let resolve!: (value: FileContentPair) => void;
  const promise = new Promise<FileContentPair>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("DiffView", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    getFileContentPairMock.mockReset();
    useRepoStore.setState({
      activeTabId: "/repo",
      selectedFilePath: null,
      selectedFileIsStaged: false,
      localDiff: null,
      repoInfo: null,
      settings: null,
      status: null,
    });
  });

  // B3: a conflicted path has no stage-0 index entry, so the backend treats a
  // discard of it as an untracked file and deletes it from disk. The Discard
  // action must not be offered for a conflicted file.
  it("does not offer Discard for a conflicted file", async () => {
    getFileContentPairMock.mockResolvedValue({ original: "", modified: "" });
    useRepoStore.setState({
      selectedFilePath: "conflicted.txt",
      selectedFileIsStaged: false,
      status: {
        branch: "main",
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: ["conflicted.txt"],
        state: "Merge",
      },
    });
    render(<DiffView />);

    await waitFor(() => {
      expect(getFileContentPairMock).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /Discard/ }),
    ).not.toBeInTheDocument();
  });

  // Phase 6: an oversized file is not handed to the editor; the view says why.
  it("shows a placeholder instead of the editor for a file that is too large", async () => {
    getFileContentPairMock.mockResolvedValue({
      original: "",
      modified: "",
      tooLarge: true,
    });
    useRepoStore.setState({ selectedFilePath: "huge.log" });
    render(<DiffView />);

    expect(await screen.findByText("File Too Large")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-editor")).not.toBeInTheDocument();
  });

  it("shows an empty state when no file is selected", () => {
    render(<DiffView />);
    expect(screen.getByText("No File Selected")).toBeInTheDocument();
  });

  it("does not let a stale file-content fetch overwrite a newer selection", async () => {
    const deferredA = makeDeferred();
    const deferredB = makeDeferred();
    getFileContentPairMock.mockImplementation((_tabId: string, path: string) =>
      path === "a.txt" ? deferredA.promise : deferredB.promise,
    );

    useRepoStore.setState({ selectedFilePath: "a.txt" });
    const { rerender } = render(<DiffView />);

    await waitFor(() =>
      expect(getFileContentPairMock).toHaveBeenCalledWith(
        "/repo",
        "a.txt",
        false,
        null,
      ),
    );

    // Switch to b.txt before a.txt's fetch has resolved — mirrors rapidly
    // clicking through files in the staging list.
    useRepoStore.setState({ selectedFilePath: "b.txt" });
    rerender(<DiffView />);

    await waitFor(() =>
      expect(getFileContentPairMock).toHaveBeenCalledWith(
        "/repo",
        "b.txt",
        false,
        null,
      ),
    );

    deferredB.resolve({ original: "b-original", modified: "b-modified" });
    await waitFor(() => {
      expect(screen.getByTestId("diff-modified")).toHaveTextContent(
        "b-modified",
      );
    });

    // The older a.txt request resolves late. It must not clobber b.txt's
    // already-displayed content.
    deferredA.resolve({ original: "a-original", modified: "a-modified" });
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByTestId("diff-modified")).toHaveTextContent("b-modified");
  });

  // A staged rename has no file under its new name in HEAD; the HEAD side must
  // be read under the old one or the whole file shows as added.
  it("reads a staged rename's HEAD side under its old name", async () => {
    getFileContentPairMock.mockResolvedValue({ original: "", modified: "" });
    useRepoStore.setState({
      selectedFilePath: "new.txt",
      selectedFileIsStaged: true,
      status: {
        branch: "main",
        ahead: 0,
        behind: 0,
        staged: [
          {
            path: "new.txt",
            oldPath: "old.txt",
            status: "renamed",
            isStaged: true,
          },
        ],
        unstaged: [],
        untracked: [],
        conflicted: [],
        state: "Clean",
      },
    });
    render(<DiffView />);

    await waitFor(() =>
      expect(getFileContentPairMock).toHaveBeenCalledWith(
        "/repo",
        "new.txt",
        true,
        "old.txt",
      ),
    );
  });

  // Discarding an untracked file deletes it; the button and the confirmation
  // must say "Delete", as the staging context menu already does.
  it("labels the action Delete for an untracked file", async () => {
    getFileContentPairMock.mockResolvedValue({ original: "", modified: "" });
    useRepoStore.setState({
      selectedFilePath: "scratch.txt",
      selectedFileIsStaged: false,
      status: {
        branch: "main",
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: ["scratch.txt"],
        conflicted: [],
        state: "Clean",
      },
    });
    useUIStore.setState({ confirmOptions: null });
    render(<DiffView />);

    const button = await screen.findByRole("button", { name: "Delete" });
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    button.click();
    expect(useUIStore.getState().confirmOptions).toMatchObject({
      title: "Delete File",
      confirmLabel: "Delete File",
      isDanger: true,
    });
  });
});
