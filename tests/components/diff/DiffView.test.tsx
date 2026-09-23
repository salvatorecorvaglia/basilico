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
    });
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
});
