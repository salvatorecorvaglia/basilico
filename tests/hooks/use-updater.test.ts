import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdater } from "../../src/hooks/use-updater";
import { useUpdaterStore } from "../../src/store/updater-store";

/**
 * The delay, the once-only guard and the build-time opt-out are the whole
 * hook: a regression in any of them means either an update check competing
 * with startup work, a check firing repeatedly, or a test build hitting the
 * network.
 */

const checkForUpdates = vi.fn(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  checkForUpdates.mockClear();
  useUpdaterStore.setState({ checkForUpdates });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("useUpdater", () => {
  it("waits five seconds before checking", () => {
    renderHook(() => useUpdater());

    expect(checkForUpdates).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4_999);
    expect(checkForUpdates).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });

  it("checks once per session, however often it re-renders", () => {
    const { rerender } = renderHook(() => useUpdater());
    rerender();
    rerender();

    vi.advanceTimersByTime(5_000);
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });

  it("does not check after unmounting", () => {
    const { unmount } = renderHook(() => useUpdater());
    unmount();

    vi.advanceTimersByTime(5_000);
    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it("honours BASILICO_DISABLE_UPDATE_CHECK", () => {
    vi.stubEnv("BASILICO_DISABLE_UPDATE_CHECK", "1");
    renderHook(() => useUpdater());

    vi.advanceTimersByTime(5_000);
    expect(checkForUpdates).not.toHaveBeenCalled();
  });
});
