import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { Toolbar } from "../../../src/components/layout/Toolbar";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

describe("Toolbar — force push", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // Toolbar renders the color-scheme toggle, which reads this on mount;
    // jsdom does not implement matchMedia.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const push = vi.fn().mockResolvedValue(undefined);
    useRepoStore.setState({
      status: {
        branch: "main",
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        state: "Clean",
      },
      isRefreshing: false,
      refreshAll: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue("success"),
      push,
      // The toolbar targets whichever remote `selectDefaultRemote` picks, so a
      // repository with no remotes at all leaves the sync buttons disabled.
      remotes: [
        { name: "origin", url: "git@github.com:o/r.git", pushUrl: null },
      ],
      branches: [],
      checkoutBranch: vi.fn().mockResolvedValue(undefined),
      tabs: [{ id: "/repo", path: "/repo", name: "repo", isActive: true }],
      activeTabId: "/repo",
      switchTab: vi.fn(),
      openRepository: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({ confirmOptions: null });
  });

  // Force push previously had no UI entry point at all — the toolbar's push
  // button only ever called push(..., force: false). Right-clicking it is
  // the only way to reach the destructive path, so it must exist and must
  // require confirmation before touching the remote.
  it("offers force push via right-click, gated behind a danger confirmation", async () => {
    const user = userEvent.setup();
    render(<Toolbar />);

    const pushBtn = screen.getByRole("button", { name: /^Push to remote/ });
    fireEvent.contextMenu(pushBtn);

    const forcePushItem = await screen.findByText(/Force Push/);
    await user.click(forcePushItem);

    await waitFor(() => {
      expect(useUIStore.getState().confirmOptions).not.toBeNull();
    });
    const confirm = useUIStore.getState().confirmOptions;
    expect(confirm?.isDanger).toBe(true);
    expect(confirm?.message).toMatch(/overwrites the remote branch/i);

    // Nothing pushed yet — only after the user confirms.
    expect(useRepoStore.getState().push).not.toHaveBeenCalled();

    await confirm?.onConfirm();

    await waitFor(() => {
      expect(useRepoStore.getState().push).toHaveBeenCalledWith(
        "origin",
        "main",
        true,
      );
    });
  });

  it("a plain click still does a normal (non-force) push", async () => {
    const user = userEvent.setup();
    render(<Toolbar />);

    const pushBtn = screen.getByRole("button", { name: /^Push to remote/ });
    await user.click(pushBtn);

    await waitFor(() => {
      expect(useRepoStore.getState().push).toHaveBeenCalledWith(
        "origin",
        "main",
        false,
      );
    });
  });
});

describe("Toolbar — remote selection", () => {
  function seed(
    overrides: Partial<Parameters<typeof useRepoStore.setState>[0]>,
  ) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    useRepoStore.setState({
      status: {
        branch: "main",
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        state: "Clean",
      },
      isRefreshing: false,
      refreshAll: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue("success"),
      push: vi.fn().mockResolvedValue(undefined),
      remotes: [],
      branches: [],
      checkoutBranch: vi.fn().mockResolvedValue(undefined),
      tabs: [{ id: "/repo", path: "/repo", name: "repo", isActive: true }],
      activeTabId: "/repo",
      switchTab: vi.fn(),
      openRepository: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    });
    useUIStore.setState({ confirmOptions: null });
  }

  // Fetch/pull/push were hardcoded to "origin", so a repository whose remote
  // is named anything else could not sync from the toolbar at all.
  it("pushes to the only remote even when it is not named origin", async () => {
    const user = userEvent.setup();
    seed({
      remotes: [
        { name: "upstream", url: "git@github.com:o/r.git", pushUrl: null },
      ],
    });
    render(<Toolbar />);

    await user.click(screen.getByRole("button", { name: /^Push to remote/ }));

    await waitFor(() => {
      expect(useRepoStore.getState().push).toHaveBeenCalledWith(
        "upstream",
        "main",
        false,
      );
    });
  });

  it("prefers origin when several remotes are configured", async () => {
    const user = userEvent.setup();
    seed({
      remotes: [
        { name: "upstream", url: "git@github.com:up/r.git", pushUrl: null },
        { name: "origin", url: "git@github.com:me/r.git", pushUrl: null },
      ],
    });
    render(<Toolbar />);

    await user.click(
      screen.getByRole("button", { name: /^Fetch from remote/ }),
    );

    await waitFor(() => {
      expect(useRepoStore.getState().fetch).toHaveBeenCalledWith("origin");
    });
  });

  it("falls back to the remote the checked-out branch tracks", async () => {
    const user = userEvent.setup();
    seed({
      remotes: [
        { name: "fork", url: "git@github.com:me/r.git", pushUrl: null },
        { name: "canonical", url: "git@github.com:up/r.git", pushUrl: null },
      ],
      branches: [
        {
          name: "main",
          isHead: true,
          isRemote: false,
          upstream: "canonical/main",
          ahead: 0,
          behind: 0,
          oid: "a".repeat(40),
        },
      ],
    });
    render(<Toolbar />);

    await user.click(
      screen.getByRole("button", { name: /^Fetch from remote/ }),
    );

    await waitFor(() => {
      expect(useRepoStore.getState().fetch).toHaveBeenCalledWith("canonical");
    });
  });

  it("disables the sync buttons when the repository has no remote", () => {
    seed({ remotes: [] });
    render(<Toolbar />);

    for (const label of [
      /^Fetch from remote/,
      /^Pull from remote/,
      /^Push to remote/,
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });
});
