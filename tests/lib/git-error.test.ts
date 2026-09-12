import { beforeEach, describe, expect, it, vi } from "vitest";

// Must be mocked before the command wrappers are imported.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { GitCommandError, reportError } from "../../src/lib/git-error";
import { getStatus } from "../../src/lib/tauri-commands";
import { useUIStore } from "../../src/store/ui-store";

function notifications() {
  return useUIStore.getState().notifications;
}

beforeEach(() => {
  invokeMock.mockReset();
  useUIStore.setState({ notifications: [] });
});

describe("errors from a failed Tauri command", () => {
  /**
   * Rust serialises `AppError` as a plain `{ message, kind }` object. Throwing
   * that object meant every `${err}` in a catch block rendered
   * "[object Object]" — which is what the app's error toasts actually said.
   */
  it("is a real Error, so interpolating it reads correctly", async () => {
    invokeMock.mockRejectedValueOnce({
      message: "some raw git failure",
      kind: "GitError",
    });

    const err = await getStatus("/repo", { silent: true }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(`Push failed: ${err}`).not.toContain("[object Object]");
    expect(`Push failed: ${err}`).toContain("some raw git failure");
  });

  it("carries the friendly message and keeps the raw one for logs", async () => {
    invokeMock.mockRejectedValueOnce({
      message: "failed to authenticate with remote",
      kind: "GitError",
    });

    const err: GitCommandError = await getStatus("/repo", {
      silent: true,
    }).catch((e) => e);

    // error-messages.ts maps this to actionable guidance.
    expect(err.message).toContain("Authentication failed");
    expect(err.rawMessage).toBe("failed to authenticate with remote");
    expect(err.kind).toBe("GitError");
  });

  it("raises exactly one toast when the command reports it", async () => {
    invokeMock.mockRejectedValueOnce({
      message: "failed to authenticate with remote",
      kind: "GitError",
    });

    // Not silent: invokeCommand owns the toast.
    const err = await getStatus("/repo", { errorPrefix: "Push failed" }).catch(
      (e) => e,
    );
    expect(notifications()).toHaveLength(1);

    // A component catch block that also reports must not add a second one.
    reportError(err, "Push failed");
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0].message).toContain("Authentication failed");
    expect(notifications()[0].message).not.toContain("[object Object]");
  });

  it("still reports an error the command was told to stay silent about", async () => {
    invokeMock.mockRejectedValueOnce({ message: "boom", kind: "GitError" });

    const err = await getStatus("/repo", { silent: true }).catch((e) => e);
    expect(notifications()).toHaveLength(0);

    reportError(err, "Refresh failed");
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0].message).toBe("Refresh failed: boom");
  });
});

describe("reportError", () => {
  it("reports a plain Error", () => {
    reportError(new Error("kaboom"), "Something failed");
    expect(notifications()[0].message).toBe("Something failed: kaboom");
  });

  it("reports a non-Error value without rendering [object Object]", () => {
    reportError("a bare string", "Something failed");
    expect(notifications()[0].message).toBe("Something failed: a bare string");
  });
});
