import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkMock = vi.fn();
const relaunchMock = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => checkMock(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => relaunchMock(),
}));

import { useUpdaterStore } from "../../src/store/updater-store";

type ProgressEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

/** An update whose download reports the given events, then resolves. */
function fakeUpdate(events: ProgressEvent[] = []) {
  return {
    available: true,
    version: "1.2.0",
    downloadAndInstall: vi.fn(async (onEvent: (e: ProgressEvent) => void) => {
      for (const e of events) onEvent(e);
    }),
  };
}

const initial = useUpdaterStore.getState();

beforeEach(() => {
  checkMock.mockReset();
  relaunchMock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  useUpdaterStore.setState(initial, true);
  vi.stubEnv("PROD", true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("updater store", () => {
  it("never checks outside production builds", async () => {
    vi.stubEnv("PROD", false);
    await useUpdaterStore.getState().checkForUpdates();
    expect(checkMock).not.toHaveBeenCalled();
    expect(useUpdaterStore.getState().status).toBe("idle");
  });

  it("records an available update and un-dismisses the prompt", async () => {
    useUpdaterStore.setState({ dismissed: true });
    checkMock.mockResolvedValue(fakeUpdate());

    await useUpdaterStore.getState().checkForUpdates();
    expect(useUpdaterStore.getState()).toMatchObject({
      status: "available",
      version: "1.2.0",
      dismissed: false,
    });
  });

  it("goes back to idle when there is no update", async () => {
    checkMock.mockResolvedValue(null);
    await useUpdaterStore.getState().checkForUpdates();
    expect(useUpdaterStore.getState()).toMatchObject({
      status: "idle",
      updateRef: null,
    });
  });

  it("keeps a failed check quiet but remembers why", async () => {
    checkMock.mockRejectedValue(new Error("offline"));
    await useUpdaterStore.getState().checkForUpdates();
    expect(useUpdaterStore.getState()).toMatchObject({
      status: "idle",
      error: "offline",
    });
  });

  it("reports download progress as a percentage, then is ready", async () => {
    const update = fakeUpdate([
      { event: "Started", data: { contentLength: 200 } },
      { event: "Progress", data: { chunkLength: 50 } },
      { event: "Progress", data: { chunkLength: 50 } },
      { event: "Finished" },
    ]);
    const seen: number[] = [];
    const unsubscribe = useUpdaterStore.subscribe((s) => seen.push(s.progress));
    useUpdaterStore.setState({
      status: "available",
      updateRef: update as never,
    });

    await useUpdaterStore.getState().downloadAndInstall();
    unsubscribe();

    expect(seen).toContain(25);
    expect(seen).toContain(50);
    expect(useUpdaterStore.getState()).toMatchObject({
      status: "ready",
      progress: 100,
    });
  });

  it("does not start a second download while one is running", async () => {
    let finish: () => void = () => {};
    const update = {
      ...fakeUpdate(),
      downloadAndInstall: vi.fn(
        () =>
          new Promise<void>((r) => {
            finish = r;
          }),
      ),
    };
    useUpdaterStore.setState({
      status: "available",
      updateRef: update as never,
    });

    const first = useUpdaterStore.getState().downloadAndInstall();
    await useUpdaterStore.getState().downloadAndInstall();
    finish();
    await first;

    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed download", async () => {
    const update = {
      ...fakeUpdate(),
      downloadAndInstall: vi.fn().mockRejectedValue(new Error("bad signature")),
    };
    useUpdaterStore.setState({
      status: "available",
      updateRef: update as never,
    });

    await useUpdaterStore.getState().downloadAndInstall();
    expect(useUpdaterStore.getState()).toMatchObject({
      status: "error",
      error: "bad signature",
    });
  });

  it("relaunches, and reports a failed relaunch", async () => {
    relaunchMock.mockResolvedValueOnce(undefined);
    await useUpdaterStore.getState().restartApp();
    expect(relaunchMock).toHaveBeenCalled();

    relaunchMock.mockRejectedValueOnce("denied");
    await useUpdaterStore.getState().restartApp();
    expect(useUpdaterStore.getState()).toMatchObject({
      status: "error",
      error: "denied",
    });
  });
});
