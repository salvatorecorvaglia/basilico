import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { RepoSearch } from "../../../src/components/search/RepoSearch";
import type { GraphCommit, GrepMatch } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const COMMIT: GraphCommit = {
  oid: "e".repeat(40),
  shortOid: "eeeeeee",
  message: "fix(parser): handle (",
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 0,
  committerName: "Ada",
  committerDate: 0,
  parentOids: [],
  refs: [],
  lane: 0,
  edges: [],
};

const MATCH: GrepMatch = {
  filePath: "src/parse.ts",
  lineNumber: 12,
  content: "   if (token === '(') {",
};

describe("RepoSearch", () => {
  beforeEach(() => {
    useRepoStore.setState({
      commitSearchResults: [],
      grepSearchResults: [],
      searchCommits: vi.fn(async () => {
        useRepoStore.setState({ commitSearchResults: [COMMIT] });
      }),
      grepCode: vi.fn(async () => {
        useRepoStore.setState({ grepSearchResults: [MATCH] });
      }),
      selectCommit: vi.fn().mockResolvedValue(undefined),
      selectLocalFile: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({ activeView: "search" });
  });

  it("does not claim 'no matches' before anything was searched", () => {
    render(<RepoSearch />);
    expect(
      screen.getByText("Search commit messages and authors"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No commits match/)).not.toBeInTheDocument();
  });

  it("says so when a search finds nothing", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({
      searchCommits: vi.fn().mockResolvedValue(undefined),
    });
    render(<RepoSearch />);

    await user.type(
      screen.getByPlaceholderText("Search messages or authors..."),
      "nothing{Enter}",
    );
    expect(
      await screen.findByText("No commits match your query"),
    ).toBeInTheDocument();
  });

  it("ignores a blank query", async () => {
    const user = userEvent.setup();
    render(<RepoSearch />);

    await user.type(
      screen.getByPlaceholderText("Search messages or authors..."),
      "   {Enter}",
    );
    expect(useRepoStore.getState().searchCommits).not.toHaveBeenCalled();
  });

  it("searches commits and opens a result in the graph", async () => {
    const user = userEvent.setup();
    render(<RepoSearch />);

    await user.type(
      screen.getByPlaceholderText("Search messages or authors..."),
      "fix({Enter}",
    );
    expect(useRepoStore.getState().searchCommits).toHaveBeenCalledWith("fix(");
    expect(
      await screen.findByText("Found 1 matching commits"),
    ).toBeInTheDocument();

    await user.click(screen.getByText("fix(parser): handle ("));
    expect(useRepoStore.getState().selectCommit).toHaveBeenCalledWith(
      COMMIT.oid,
    );
    await waitFor(() => expect(useUIStore.getState().activeView).toBe("graph"));
  });

  it("greps code and opens a match in blame, also from the keyboard", async () => {
    const user = userEvent.setup();
    render(<RepoSearch />);

    await user.click(screen.getByRole("button", { name: /Code \(Grep\)/ }));
    await user.type(
      screen.getByPlaceholderText("Search code snippet..."),
      "token{Enter}",
    );
    expect(useRepoStore.getState().grepCode).toHaveBeenCalledWith("token");

    const row = (await screen.findByText("src/parse.ts")).closest(
      "[role=button]",
    ) as HTMLElement;
    expect(screen.getByText("Line 12")).toBeInTheDocument();
    row.focus();
    await user.keyboard("{Enter}");

    expect(useRepoStore.getState().selectLocalFile).toHaveBeenCalledWith(
      "src/parse.ts",
      false,
    );
    expect(useUIStore.getState().activeView).toBe("blame");
  });

  it("clears the query and results", async () => {
    const user = userEvent.setup();
    render(<RepoSearch />);

    const input = screen.getByPlaceholderText("Search messages or authors...");
    await user.type(input, "fix{Enter}");
    await screen.findByText("Found 1 matching commits");

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(useRepoStore.getState().commitSearchResults).toEqual([]);
    expect(
      screen.getByText("Search commit messages and authors"),
    ).toBeInTheDocument();
  });
});
