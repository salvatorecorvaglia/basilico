import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { CommitBox } from "../../../src/components/staging/CommitBox";
import type { GraphCommit, RepoStatus } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";

const status = (stagedCount: number): RepoStatus => ({
  branch: "main",
  ahead: 0,
  behind: 0,
  staged: Array.from({ length: stagedCount }, (_, i) => ({
    path: `f${i}.txt`,
    status: "modified" as const,
    isStaged: true,
  })),
  unstaged: [],
  untracked: [],
  conflicted: [],
  state: "Clean",
});

// What the graph hands over: the subject line only.
const HEAD: GraphCommit = {
  oid: "a".repeat(40),
  shortOid: "aaaaaaa",
  message: "fix: handle empty input",
  authorName: "A",
  authorEmail: "a@example.com",
  authorDate: 0,
  committerName: "A",
  committerDate: 0,
  parentOids: [],
  refs: [],
  lane: 0,
  edges: [],
};

const FULL_MESSAGE =
  "fix: handle empty input\n\nThe parser assumed at least one token.\n\nRefs: #42\n";

const summaryInput = () =>
  screen.getByPlaceholderText(/Commit title/) as HTMLInputElement;
const descriptionInput = () =>
  screen.getByPlaceholderText(/extended description/) as HTMLTextAreaElement;

describe("CommitBox", () => {
  let commitMock: ReturnType<
    typeof vi.fn<(m: string, a?: boolean, expected?: string) => Promise<void>>
  >;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_amend_commit"
        ? Promise.resolve({ oid: HEAD.oid, message: FULL_MESSAGE })
        : Promise.resolve(undefined),
    );
    commitMock = vi
      .fn<(m: string, a?: boolean) => Promise<void>>()
      .mockResolvedValue(undefined);
    useRepoStore.setState({
      activeTabId: "/repo",
      commitDrafts: {},
      repoInfo: null,
      status: status(2),
      commits: [HEAD],
      isLoading: false,
      commit: commitMock,
    });
  });

  it("only enables committing with a title and staged changes", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({ status: status(0) });
    render(<CommitBox />);

    const submit = screen.getByRole("button", { name: /Commit Changes \(0\)/ });
    expect(submit).toBeDisabled();
    await user.type(summaryInput(), "feat: x");
    expect(submit).toBeDisabled();

    useRepoStore.setState({ status: status(1) });
    expect(
      await screen.findByRole("button", { name: /Commit Changes \(1\)/ }),
    ).toBeEnabled();
  });

  it("commits title and description as one message, then clears the form", async () => {
    const user = userEvent.setup();
    render(<CommitBox />);

    await user.type(summaryInput(), "  feat: login  ");
    await user.type(descriptionInput(), "Adds the form.");
    await user.click(screen.getByRole("button", { name: /Commit Changes/ }));

    expect(commitMock).toHaveBeenCalledWith(
      "feat: login\n\nAdds the form.",
      false,
    );
    await waitFor(() => expect(summaryInput().value).toBe(""));
  });

  it("commits with Cmd/Ctrl+Enter", async () => {
    const user = userEvent.setup();
    render(<CommitBox />);

    await user.type(summaryInput(), "chore: bump");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(commitMock).toHaveBeenCalledWith("chore: bump", false);
  });

  it("replaces an existing conventional prefix instead of stacking it", async () => {
    const user = userEvent.setup();
    render(<CommitBox />);

    await user.type(summaryInput(), "fix(ui): align button");
    await user.click(screen.getByRole("button", { name: "feat" }));
    expect(summaryInput().value).toBe("feat: align button");
  });

  // Regression: the graph carries only subjects, so amending from it dropped
  // the commit body.
  it("pre-fills the full message — body included — when amending", async () => {
    const user = userEvent.setup();
    render(<CommitBox />);

    await user.click(screen.getByLabelText("Amend last commit"));

    expect(invokeMock).toHaveBeenCalledWith("get_amend_commit", {
      path: "/repo",
    });
    await waitFor(() =>
      expect(descriptionInput().value).toBe(
        "The parser assumed at least one token.\n\nRefs: #42",
      ),
    );
    expect(summaryInput().value).toBe("fix: handle empty input");

    await user.click(screen.getByRole("button", { name: /Amend Commit/ }));
    expect(commitMock).toHaveBeenCalledWith(
      "fix: handle empty input\n\nThe parser assumed at least one token.\n\nRefs: #42",
      true,
      HEAD.oid,
    );
  });

  it("allows amending with nothing staged", async () => {
    const user = userEvent.setup();
    useRepoStore.setState({ status: status(0) });
    render(<CommitBox />);

    await user.click(screen.getByLabelText("Amend last commit"));
    expect(
      await screen.findByRole("button", { name: /Amend Commit/ }),
    ).toBeEnabled();
  });

  it("restores the draft when Amend is unticked without edits", async () => {
    const user = userEvent.setup();
    render(<CommitBox />);

    await user.type(summaryInput(), "wip draft");
    const amend = screen.getByLabelText("Amend last commit");
    await user.click(amend);
    await waitFor(() => expect(descriptionInput().value).not.toBe(""));
    await user.click(amend);

    expect(summaryInput().value).toBe("wip draft");
    expect(descriptionInput().value).toBe("");
  });

  it("keeps an edited amend message when Amend is unticked", async () => {
    const user = userEvent.setup();
    render(<CommitBox />);

    const amend = screen.getByLabelText("Amend last commit");
    await user.click(amend);
    await waitFor(() => expect(descriptionInput().value).not.toBe(""));
    await user.type(summaryInput(), "!");
    await user.click(amend);

    expect(summaryInput().value).toBe("fix: handle empty input!");
  });

  it("blocks submission while HEAD loads and after a failed lookup", async () => {
    const user = userEvent.setup();
    let reject: (reason: Error) => void = () => {};
    invokeMock.mockReturnValue(
      new Promise((_, r) => {
        reject = r;
      }),
    );
    render(<CommitBox />);
    await user.type(summaryInput(), "draft");
    await user.click(screen.getByLabelText("Amend last commit"));
    expect(summaryInput()).toBeDisabled();
    expect(screen.getByRole("button", { name: /Amend Commit/ })).toBeDisabled();
    await act(async () => reject(new Error("read failed")));
    expect(screen.getByRole("button", { name: /Amend Commit/ })).toBeDisabled();
    expect(commitMock).not.toHaveBeenCalled();
  });

  it("does not use another branch's first visible commit as the amend message", async () => {
    useRepoStore.setState({
      commits: [{ ...HEAD, oid: "b".repeat(40), message: "another branch" }],
    });
    render(<CommitBox />);
    await userEvent.click(screen.getByLabelText("Amend last commit"));
    await waitFor(() =>
      expect(summaryInput().value).toBe("fix: handle empty input"),
    );
    expect(descriptionInput().value).toContain("Refs: #42");
  });

  it("amends HEAD even when the filtered graph is empty", async () => {
    useRepoStore.setState({ commits: [] });
    render(<CommitBox />);
    await userEvent.click(screen.getByLabelText("Amend last commit"));
    await waitFor(() =>
      expect(summaryInput().value).toBe("fix: handle empty input"),
    );
    expect(screen.getByRole("button", { name: /Amend Commit/ })).toBeEnabled();
  });

  it("keeps repository drafts and ignores a late amend response after switching", async () => {
    const user = userEvent.setup();
    let release: (value: { oid: string; message: string }) => void = () => {};
    invokeMock.mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    render(<CommitBox />);
    await user.type(summaryInput(), "repository A draft");
    await user.click(screen.getByLabelText("Amend last commit"));
    act(() => useRepoStore.setState({ activeTabId: "/other" }));
    expect(summaryInput().value).toBe("");
    expect(screen.getByLabelText("Amend last commit")).not.toBeChecked();
    await user.type(summaryInput(), "repository B draft");
    await act(async () => release({ oid: HEAD.oid, message: FULL_MESSAGE }));
    expect(summaryInput().value).toBe("repository B draft");
    act(() => useRepoStore.setState({ activeTabId: "/repo" }));
    expect(summaryInput().value).toBe("repository A draft");
    expect(screen.getByLabelText("Amend last commit")).not.toBeChecked();
  });
});
