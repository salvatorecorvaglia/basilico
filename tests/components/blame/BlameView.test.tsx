import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { BlameView } from "../../../src/components/blame/BlameView";
import type { BlameLine } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const OID = "d".repeat(40);

const LINES: BlameLine[] = [
  {
    lineNo: 1,
    commitOid: OID,
    shortOid: "dddddddd",
    authorName: "Ada",
    authorEmail: "ada@example.com",
    commitSummary: "initial",
    lineContent: "const a = 1;",
  },
  {
    // A line that only exists in the working tree.
    lineNo: 2,
    commitOid: "",
    shortOid: "",
    authorName: "Not Committed Yet",
    authorEmail: "",
    commitSummary: "Local modifications",
    lineContent: "const b = 2;",
  },
];

describe("BlameView", () => {
  beforeEach(() => {
    useRepoStore.setState({
      selectedFilePath: "src/a.ts",
      selectedCommitOid: null,
      blameLines: LINES,
      isLoading: false,
      settings: null,
      loadFileBlame: vi.fn().mockResolvedValue(undefined),
      selectCommit: vi.fn().mockResolvedValue(undefined),
      openInIde: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({ activeView: "blame" });
  });

  it("blames the selected file at the working tree by default", () => {
    render(<BlameView />);
    expect(useRepoStore.getState().loadFileBlame).toHaveBeenCalledWith(
      "src/a.ts",
      null,
    );
    expect(screen.getByText("const a = 1;")).toBeInTheDocument();
    expect(screen.getByText("Not Committed Yet")).toBeInTheDocument();
  });

  it("jumps to a line's commit in the graph", async () => {
    const user = userEvent.setup();
    render(<BlameView />);

    await user.click(screen.getByRole("button", { name: "dddddddd" }));
    expect(useRepoStore.getState().selectCommit).toHaveBeenCalledWith(OID);
    expect(useUIStore.getState().activeView).toBe("graph");
  });

  it("offers blame-before only for committed lines", () => {
    render(<BlameView />);
    expect(
      screen.getAllByTitle("Blame parent (before this commit)"),
    ).toHaveLength(1);
  });

  it("re-blames at the parent, and resets back to the working tree", async () => {
    const user = userEvent.setup();
    render(<BlameView />);
    const load = useRepoStore.getState().loadFileBlame as ReturnType<
      typeof vi.fn
    >;

    await user.click(screen.getByTitle("Blame parent (before this commit)"));
    expect(load).toHaveBeenLastCalledWith("src/a.ts", `${OID}^`);
    expect(screen.getByText(new RegExp(`@ ${OID}\\^`))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Reset/ }));
    expect(load).toHaveBeenLastCalledWith("src/a.ts", null);
  });

  it("opens the clicked line in the editor, repo-relative", async () => {
    const user = userEvent.setup();
    render(<BlameView />);

    await user.click(screen.getByTitle("Open line 2 in external editor"));
    expect(useRepoStore.getState().openInIde).toHaveBeenCalledWith(
      "src/a.ts",
      2,
      true,
    );
  });

  it("explains when there is nothing to show", () => {
    useRepoStore.setState({ blameLines: [] });
    render(<BlameView />);
    expect(
      screen.getByText("No blame data available for this file."),
    ).toBeInTheDocument();
  });
});
