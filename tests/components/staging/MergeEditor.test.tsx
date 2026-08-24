import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

vi.mock("@monaco-editor/react", () => ({
  default: (props: {
    value: string;
    onChange?: (v: string | undefined) => void;
    options?: { readOnly?: boolean };
  }) => (
    <textarea
      data-testid="monaco-mock"
      data-readonly={String(!!props.options?.readOnly)}
      readOnly={props.options?.readOnly}
      value={props.value}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  ),
}));

vi.mock("../../../src/lib/monaco-setup", () => ({
  disposeModelsOnUnmount: () => {},
}));
vi.mock("../../../src/lib/use-dark-mode", () => ({ useDarkMode: () => false }));

import { MergeEditor } from "../../../src/components/staging/MergeEditor";
import { useRepoStore } from "../../../src/store/repo-store";

const MERGED_WITH_TWO_BLOCKS = [
  "<<<<<<< HEAD",
  "ours-A",
  "=======",
  "theirs-A",
  ">>>>>>> branch",
  "<<<<<<< HEAD",
  "ours-B",
  "=======",
  "theirs-B",
  ">>>>>>> branch",
].join("\n");

function editableTextarea(): HTMLTextAreaElement {
  const editors = screen.getAllByTestId("monaco-mock");
  const editable = editors.find(
    (el) => el.getAttribute("data-readonly") === "false",
  );
  if (!editable) throw new Error("editable merged-result editor not found");
  return editable as HTMLTextAreaElement;
}

describe("MergeEditor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_conflict_stages") {
        return Promise.resolve({
          base: null,
          ours: "our file",
          theirs: "their file",
        });
      }
      if (cmd === "get_file_content_pair") {
        return Promise.resolve({
          original: "",
          modified: MERGED_WITH_TWO_BLOCKS,
        });
      }
      return Promise.resolve(undefined);
    });

    useRepoStore.setState({
      activeConflictedPath: "conflicted.txt",
      activeTabId: "/repo",
      conflictStages: null,
      settings: null,
    });
  });

  it("replaces a resolved block with the chosen side's content", async () => {
    render(<MergeEditor />);

    await waitFor(() => {
      expect(screen.getByText(/Conflict 1 of 2/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Accept Ours"));

    const merged = editableTextarea().value;
    expect(merged).toContain("ours-A");
    expect(merged).not.toContain("theirs-A");
    // The second block is untouched — still has its markers and both sides.
    expect(merged).toContain("<<<<<<<");
    expect(merged).toContain("ours-B");
    expect(merged).toContain("theirs-B");

    // Exactly one conflict remains now that the first is resolved.
    await waitFor(() => {
      expect(screen.getByText(/Conflict 1 of 1/)).toBeInTheDocument();
    });
  });

  it("keeps both sides, in order, when accepting both", async () => {
    render(<MergeEditor />);

    await waitFor(() => {
      expect(screen.getByText(/Conflict 1 of 2/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Accept Both"));

    const merged = editableTextarea().value;
    const oursIdx = merged.indexOf("ours-A");
    const theirsIdx = merged.indexOf("theirs-A");
    expect(oursIdx).toBeGreaterThanOrEqual(0);
    expect(theirsIdx).toBeGreaterThan(oursIdx);
    // The first block's own markers are gone; the second block is untouched.
    expect(merged.slice(0, theirsIdx)).not.toContain("<<<<<<<");
    expect(merged).toContain("ours-B");
  });

  it("clears the conflict badge once every block is resolved", async () => {
    render(<MergeEditor />);

    await waitFor(() => {
      expect(screen.getByText(/Conflict 1 of 2/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Accept Ours"));
    await waitFor(() => {
      expect(screen.getByText(/Conflict 1 of 1/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Accept Theirs"));

    await waitFor(() => {
      expect(screen.getByText("All markers cleared")).toBeInTheDocument();
    });
    const merged = editableTextarea().value;
    expect(merged).not.toContain("<<<<<<<");
  });
});
