import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { ReflogInspector } from "../../../src/components/reflog/ReflogInspector";
import type { BranchInfo, ReflogEntry } from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";

const entry = (index: number, message: string): ReflogEntry => ({
  index,
  oldOid: "0".repeat(40),
  newOid: `${index}`.padEnd(40, "a"),
  committerName: "Ada Lovelace",
  committerEmail: "ada@example.com",
  date: Math.floor(Date.now() / 1000) - 3600,
  message,
});

const branch = (name: string, isRemote = false): BranchInfo => ({
  name,
  isHead: name === "develop",
  isRemote,
  upstream: null,
  ahead: 0,
  behind: 0,
  oid: "b".repeat(40),
});

describe("ReflogInspector", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useRepoStore.setState({
      activeTabId: "/repo",
      refreshAll: vi.fn().mockResolvedValue(undefined),
      branches: [
        branch("develop"),
        branch("main"),
        branch("origin/main", true),
      ],
    });
  });

  /**
   * Git writes the bare `pull:` form only when the command had no arguments.
   * With arguments it writes `pull --tags origin develop: Fast-forward`, which
   * used to miss every prefix match and fall through to a generic branch that
   * sliced the argument string to 14 characters — so every such row rendered
   * `PULL -- TAGS OR`, wrapped over two lines.
   */
  it("labels reflog actions by their verb, not their arguments", async () => {
    const entries = [
      entry(0, "pull --tags origin develop: Fast-forward"),
      entry(1, "commit: Update dependencies"),
      entry(2, "reset: moving to HEAD~1"),
      entry(3, "rebase -i (start): checkout HEAD~3"),
      entry(4, "checkout: moving from main to develop"),
      entry(5, "cherry-pick: fixup"),
    ];
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_reflog"
        ? Promise.resolve(entries)
        : Promise.resolve(undefined),
    );

    render(<ReflogInspector />);

    await waitFor(() => {
      expect(screen.getByText("pull")).toBeInTheDocument();
    });

    for (const verb of [
      "pull",
      "commit",
      "reset",
      "rebase",
      "checkout",
      "cherry-pick",
    ]) {
      expect(screen.getByText(verb)).toBeInTheDocument();
    }

    // The full message still belongs in the Message column; what must never
    // appear again is a *badge* built out of the argument string.
    const badges = Array.from(
      document.querySelectorAll(".reflog-action-badge"),
    ).map((b) => b.textContent);
    expect(badges).toEqual([
      "pull",
      "commit",
      "reset",
      "rebase",
      "checkout",
      "cherry-pick",
    ]);
  });

  /**
   * The ref dropdown was hardcoded to HEAD/main/master/develop, so it offered a
   * `master` that many repositories do not have while their real branches were
   * unreachable.
   */
  it("offers the repository's own local branches as reflog targets", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "get_reflog" ? Promise.resolve([]) : Promise.resolve(undefined),
    );

    render(<ReflogInspector />);

    const select = await screen.findByLabelText("Git reference to inspect");
    const options = Array.from(select.querySelectorAll("option")).map(
      (o) => (o as HTMLOptionElement).value,
    );

    expect(options).toEqual(["HEAD", "refs/heads/develop", "refs/heads/main"]);
    // Remote-tracking refs rarely carry a reflog, so they are not offered.
    expect(options).not.toContain("refs/heads/origin/main");
    expect(options).not.toContain("refs/heads/master");
  });
});
