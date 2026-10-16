import { render, screen, waitFor } from "@testing-library/react";
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
    typeof vi.fn<(m: string, a?: boolean) => Promise<void>>
  >;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_commit_message"
        ? Promise.resolve(FULL_MESSAGE)
        : Promise.resolve(undefined),
    );
    commitMock = vi
      .fn<(m: string, a?: boolean) => Promise<void>>()
      .mockResolvedValue(undefined);
    useRepoStore.setState({
      activeTabId: "/repo",
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

    expect(invokeMock).toHaveBeenCalledWith("get_commit_message", {
      path: "/repo",
      oid: HEAD.oid,
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

  it("does not overwrite what the user typed before the full message arrived", async () => {
    const user = userEvent.setup();
    let release: (m: string) => void = () => {};
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_commit_message"
        ? new Promise((r) => {
            release = r;
          })
        : Promise.resolve(undefined),
    );
    render(<CommitBox />);

    await user.click(screen.getByLabelText("Amend last commit"));
    await user.type(summaryInput(), " now");
    release(FULL_MESSAGE);

    await waitFor(() =>
      expect(descriptionInput().value).toContain("Refs: #42"),
    );
    expect(summaryInput().value).toBe("fix: handle empty input now");
  });

  it("disables Amend when there is no commit yet", () => {
    useRepoStore.setState({ commits: [] });
    render(<CommitBox />);
    expect(screen.getByLabelText("Amend last commit")).toBeDisabled();
  });
});
