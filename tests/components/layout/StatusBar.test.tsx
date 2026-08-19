import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => Promise.resolve("1.1.1"),
}));

import { StatusBar } from "../../../src/components/layout/StatusBar";
import { useRepoStore } from "../../../src/store/repo-store";

const REPO_STATUS = {
  branch: "main",
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
  state: "Clean",
};

const REPO_INFO = {
  path: "/repo",
  name: "repo",
  headBranch: "main",
  isBare: false,
  isEmpty: false,
  state: "Clean",
};

describe("StatusBar — GitHub CI status opt-in", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    useRepoStore.setState({
      status: REPO_STATUS,
      repoInfo: REPO_INFO,
      remotes: [
        {
          name: "origin",
          url: "https://github.com/owner/repo.git",
          pushUrl: null,
        },
      ],
      isRefreshing: false,
      settings: null,
    });
  });

  // The status bar used to fetch CI status from api.github.com unconditionally
  // on every branch/remote change — a desktop Git client should not phone
  // home without the user asking for it.
  it("does not call the GitHub API when the setting is off (the default)", async () => {
    render(<StatusBar />);
    // Give any effect a chance to fire before asserting the negative.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the GitHub API, with the stored PAT as bearer auth, once enabled", async () => {
    useRepoStore.setState({
      settings: {
        theme: "sage-green",
        sshKeyPath: null,
        gitAuthorName: null,
        gitAuthorEmail: null,
        keyboardShortcuts: {},
        checkGithubCiStatus: true,
        githubPat: "abc123",
      },
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workflow_runs: [] }),
    } as Response);

    render(<StatusBar />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("api.github.com");
    expect(String(url)).toContain("owner/repo");
    const headers = (opts?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer abc123");
  });
});
