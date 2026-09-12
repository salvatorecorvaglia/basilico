import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

type RepoChangedCallback = (event: { payload: { repoPath: string } }) => void;
let repoChangedCallback: RepoChangedCallback | null = null;
const listenMock = vi.fn(async (eventName: string, cb: RepoChangedCallback) => {
  if (eventName === "repo:changed") repoChangedCallback = cb;
  return () => {};
});
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: [string, RepoChangedCallback]) => listenMock(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

// Monaco does not run in jsdom, so stub it and the setup module it pulls in.
vi.mock("@monaco-editor/react", () => ({
  default: () => null,
}));
vi.mock("../src/lib/monaco-setup", () => ({
  disposeModelsOnUnmount: () => {},
}));

// Stands in for the real FileViewerModal so the test can tell whether App
// mounted it at all. Asserting on *mounting* rather than on module loading
// matters: a module mock's factory runs once and is then cached, so a
// load-counting spy stops discriminating after the first test in the file.
vi.mock("../src/components/graph/FileViewerModal", () => ({
  FileViewerModal: () => <div data-testid="file-viewer-mounted" />,
}));

import App from "../src/App";
import type { UserSettings } from "../src/lib/git-types";
import { useRepoStore } from "../src/store/repo-store";
import { useUIStore } from "../src/store/ui-store";

const SETTINGS: UserSettings = {
  theme: "sage",
  sshKeyPath: null,
  gitAuthorName: null,
  gitAuthorEmail: null,
  keyboardShortcuts: {},
};

describe("App", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_settings") return Promise.resolve(SETTINGS);
      if (cmd === "get_status") {
        return Promise.resolve({
          branch: "main",
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          untracked: [],
          conflicted: [],
          state: "Clean",
        });
      }
      return Promise.resolve(undefined);
    });
    repoChangedCallback = null;
    localStorage.clear();
    useRepoStore.setState({ tabs: [], activeTabId: "/repo", settings: null });
    useUIStore.setState({ commandPaletteOpen: false, settingsOpen: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * React.lazy fires its import when the component is *rendered*, not when it
   * becomes visible, and FileViewerModal's own `return null` guard is inside
   * the component. Rendering it unconditionally therefore pulled its chunk —
   * and the 2.6 MB monaco-setup chunk it imports — on first paint, defeating
   * every lazy boundary in App and the bundling work those boundaries exist for.
   */
  it("does not mount the Monaco-backed file viewer until it is opened", async () => {
    useUIStore.setState({
      fileViewerOpen: false,
      fileViewerPath: null,
      fileViewerOid: null,
    });

    const { queryByTestId, findByTestId } = render(<App />);
    await waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    // Let any pending React.lazy import settle before asserting absence —
    // otherwise this passes trivially, because the lazy boundary has not
    // resolved yet whether or not it was ever going to.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(queryByTestId("file-viewer-mounted")).toBeNull();

    // Opening the viewer is what should pull it in.
    await act(async () => {
      useUIStore.getState().openFileViewer("src/main.rs", "a".repeat(40));
    });
    expect(await findByTestId("file-viewer-mounted")).toBeTruthy();
  });

  it("only refreshes on a repo:changed event for the active tab, and coalesces rapid events through the debounce", async () => {
    render(<App />);

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith(
        "repo:changed",
        expect.any(Function),
      );
    });
    expect(repoChangedCallback).not.toBeNull();

    // Fake timers only from here — waitFor above polls with real setTimeout
    // and would otherwise hang forever waiting on a clock that never moves.
    vi.useFakeTimers();
    invokeMock.mockClear();

    // A different repo's change must not trigger a refresh of this tab.
    act(() => {
      repoChangedCallback?.({ payload: { repoPath: "/some-other-repo" } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(invokeMock.mock.calls.some((c) => c[0] === "get_status")).toBe(
      false,
    );

    // Three rapid events for the active repo, each restarting the 300ms
    // debounce, must still produce only one refresh.
    act(() => {
      repoChangedCallback?.({ payload: { repoPath: "/repo" } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => {
      repoChangedCallback?.({ payload: { repoPath: "/repo" } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => {
      repoChangedCallback?.({ payload: { repoPath: "/repo" } });
    });
    expect(invokeMock.mock.calls.some((c) => c[0] === "get_status")).toBe(
      false,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const statusCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "get_status",
    );
    expect(statusCalls).toHaveLength(1);
  });

  it("lets the command palette shortcut fire from an input, but not the refresh shortcut", async () => {
    render(<App />);
    await waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    invokeMock.mockClear();

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "P",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "r",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(invokeMock.mock.calls.some((c) => c[0] === "get_status")).toBe(
      false,
    );

    document.body.removeChild(input);
  });
});
