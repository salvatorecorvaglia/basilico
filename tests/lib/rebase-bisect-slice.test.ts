import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: unknown) => invoke(command, args),
}));

import type {
  BisectState,
  RebaseStatus,
  RebaseTodoItem,
} from "../../src/lib/git-types";
import { useRepoStore } from "../../src/store/repo-store";
import {
  INITIAL_LOADING_STATES,
  PER_TAB_RESET_STATE,
} from "../../src/store/types";

const item: RebaseTodoItem = {
  oid: "a".repeat(40),
  action: "reword",
  summary: "new subject",
  message: "original subject\n\nKeep this body.\n",
};
const conflict: RebaseStatus = {
  status: "conflict",
  currentOid: item.oid,
  message: "Resolve source.txt",
};
const bisect: BisectState = {
  isBisecting: true,
  message: "testing midpoint",
  currentOid: "b".repeat(40),
  stepsRemaining: 2,
};
const refresh = vi.fn<() => Promise<void>>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function session(path: string | null) {
  useRepoStore.setState((state) => ({
    ...PER_TAB_RESET_STATE,
    activeTabId: path,
    refreshGeneration: state.refreshGeneration + 1,
    loadingStates: { ...INITIAL_LOADING_STATES },
    isLoading: false,
    isRefreshing: false,
    refreshCommitsAndStatus: refresh,
  }));
}
beforeEach(() => {
  invoke.mockReset();
  refresh.mockReset().mockResolvedValue(undefined);
  session("/repo");
});

describe("rebase workflows", () => {
  it("keeps the latest plan when initialization responses arrive out of order", async () => {
    const older = deferred<RebaseTodoItem[]>(),
      newer = deferred<RebaseTodoItem[]>();
    invoke
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const first = useRepoStore.getState().initRebase("old-base");
    const second = useRepoStore.getState().initRebase("new-base");
    newer.resolve([item]);
    await second;
    older.resolve([{ ...item, summary: "stale" }]);
    await first;
    expect(useRepoStore.getState().rebaseUpstream).toBe("new-base");
    expect(useRepoStore.getState().rebaseTodoItems).toEqual([item]);
    expect(useRepoStore.getState().rebaseStatus?.status).toBe("planning");
    expect(refresh).not.toHaveBeenCalled();
    expect(useRepoStore.getState().isLoading).toBe(false);
  });

  it("sends the edited plan with its full message, retaining it at a conflict", async () => {
    useRepoStore.setState({ rebaseUpstream: "main", rebaseTodoItems: [item] });
    invoke.mockResolvedValue(conflict);
    expect(await useRepoStore.getState().startRebase()).toEqual(conflict);
    expect(invoke).toHaveBeenCalledWith("rebase_start", {
      repoPath: "/repo",
      upstream: "main",
      items: [item],
    });
    expect(useRepoStore.getState().rebaseTodoItems).toEqual([item]);
    expect(useRepoStore.getState().rebaseStatus).toEqual(conflict);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each(["finished", "none"] as const)(
    "clears the plan after a %s response",
    async (status) => {
      useRepoStore.setState({
        rebaseUpstream: "main",
        rebaseTodoItems: [item],
        rebaseStatus: conflict,
      });
      invoke.mockResolvedValue({ status, currentOid: null, message: null });
      await useRepoStore
        .getState()
        .stepRebase(
          status === "none" ? "abort" : "continue",
          "resolved message",
        );
      expect(invoke).toHaveBeenCalledWith("rebase_step", {
        repoPath: "/repo",
        action: status === "none" ? "abort" : "continue",
        commitMessage: "resolved message",
      });
      expect(useRepoStore.getState().rebaseTodoItems).toEqual([]);
      expect(useRepoStore.getState().rebaseUpstream).toBeNull();
      expect(refresh).toHaveBeenCalledOnce();
    },
  );

  it("preserves the plan and releases loading after a failed start", async () => {
    useRepoStore.setState({ rebaseUpstream: "main", rebaseTodoItems: [item] });
    invoke.mockRejectedValue({ message: "index locked", kind: "GitError" });
    await expect(useRepoStore.getState().startRebase()).rejects.toThrow();
    expect(useRepoStore.getState().rebaseTodoItems).toEqual([item]);
    expect(useRepoStore.getState().rebaseUpstream).toBe("main");
    expect(useRepoStore.getState().loadingStates.collaboration).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses to start without an active repository or a prepared plan", async () => {
    await expect(useRepoStore.getState().startRebase()).rejects.toThrow(
      "No rebase plan",
    );
    session(null);
    await expect(useRepoStore.getState().startRebase()).rejects.toThrow(
      "No active repository",
    );
    await expect(
      useRepoStore.getState().stepRebase("continue"),
    ).rejects.toThrow("No active repository");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not write an old repository's completed rebase into a new session", async () => {
    const old = deferred<RebaseStatus>();
    invoke.mockReturnValue(old.promise);
    const running = useRepoStore.getState().stepRebase("continue");
    session("/other");
    useRepoStore.setState({ rebaseStatus: conflict, rebaseTodoItems: [item] });
    old.resolve({ status: "finished", currentOid: null, message: null });
    await running;
    expect(useRepoStore.getState().rebaseStatus).toEqual(conflict);
    expect(useRepoStore.getState().rebaseTodoItems).toEqual([item]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("bisect workflows", () => {
  it("starts, records a verdict, and resets only after backend success", async () => {
    invoke.mockResolvedValue(bisect);
    await useRepoStore.getState().startBisect("bad-tip", "known-good");
    expect(invoke).toHaveBeenCalledWith("bisect_start", {
      repoPath: "/repo",
      bad: "bad-tip",
      good: "known-good",
    });
    expect(useRepoStore.getState().bisectState).toEqual(bisect);
    await useRepoStore.getState().markBisect("bad");
    expect(invoke).toHaveBeenCalledWith("bisect_mark", {
      repoPath: "/repo",
      status: "bad",
    });
    const reset = deferred<void>();
    invoke.mockReturnValueOnce(reset.promise);
    const resetting = useRepoStore.getState().resetBisect();
    expect(useRepoStore.getState().bisectState).toEqual(bisect);
    reset.resolve();
    await resetting;
    expect(useRepoStore.getState().bisectState).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("keeps the current bisect state after a rejected verdict", async () => {
    useRepoStore.setState({ bisectState: bisect });
    invoke.mockRejectedValue({
      message: "working tree has changes",
      kind: "InvalidState",
    });
    await expect(useRepoStore.getState().markBisect("good")).rejects.toThrow();
    expect(useRepoStore.getState().bisectState).toEqual(bisect);
    expect(useRepoStore.getState().isLoading).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("ignores a verdict response after switching repository sessions", async () => {
    const old = deferred<BisectState>();
    invoke.mockReturnValueOnce(old.promise);
    const marking = useRepoStore.getState().markBisect("skip");
    session("/other");
    old.resolve(bisect);
    await marking;
    expect(useRepoStore.getState().bisectState).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(useRepoStore.getState().isLoading).toBe(false);
  });
});
