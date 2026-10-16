import { beforeEach, describe, expect, it, vi } from "vitest";

const openUrlMock = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrlMock(url),
}));

import { openExternalUrl } from "../../src/lib/utils";
import { useUIStore } from "../../src/store/ui-store";

describe("openExternalUrl", () => {
  beforeEach(() => {
    openUrlMock.mockReset();
    openUrlMock.mockResolvedValue(undefined);
    useUIStore.setState({ notifications: [] });
  });

  // B22: `window.open` is not routed to the system browser by Tauri's
  // webview, so links silently did nothing.
  it("opens https links through the opener plugin", () => {
    openExternalUrl("https://github.com/o/r/commit/abc");
    expect(openUrlMock).toHaveBeenCalledWith(
      "https://github.com/o/r/commit/abc",
    );
  });

  it("refuses anything that is not https, and says so", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://example.com",
      "file:///etc/passwd",
    ]) {
      openExternalUrl(url);
    }
    expect(openUrlMock).not.toHaveBeenCalled();
    expect(useUIStore.getState().notifications.length).toBeGreaterThan(0);
  });

  it("reports a failure to open instead of failing silently", async () => {
    openUrlMock.mockRejectedValue(new Error("no browser"));
    openExternalUrl("https://github.com/o/r");
    await vi.waitFor(() => {
      expect(
        useUIStore
          .getState()
          .notifications.some((n) => n.message.includes("Could not open")),
      ).toBe(true);
    });
  });
});
