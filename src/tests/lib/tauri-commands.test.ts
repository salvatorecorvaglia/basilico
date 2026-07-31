import { describe, expect, it } from "vitest";
import { parseAppError } from "../../lib/tauri-commands";

describe("parseAppError", () => {
  it("should return the original object if it matches AppError structure", () => {
    const original = { message: "Failed operation", kind: "Git" };
    expect(parseAppError(original)).toEqual(original);
  });

  it("should wrap simple strings into AppError with kind Unknown", () => {
    const errorString = "Something went wrong";
    expect(parseAppError(errorString)).toEqual({
      message: "Something went wrong",
      kind: "Unknown",
    });
  });

  it("should extract message from generic Error objects", () => {
    const genericError = new Error("Standard error");
    expect(parseAppError(genericError)).toEqual({
      message: "Standard error",
      kind: "Unknown",
    });
  });

  it("should handle null or undefined input gracefully", () => {
    expect(parseAppError(null)).toEqual({
      message: "null",
      kind: "Unknown",
    });
  });
});

describe("Command Function Exports", () => {
  it("exports reflog, patch, and worktree locking functions", async () => {
    const commands = await import("../../lib/tauri-commands");
    expect(typeof commands.getReflog).toBe("function");
    expect(typeof commands.restoreReflogEntry).toBe("function");
    expect(typeof commands.createCommitPatch).toBe("function");
    expect(typeof commands.createRangePatch).toBe("function");
    expect(typeof commands.lockWorktree).toBe("function");
    expect(typeof commands.unlockWorktree).toBe("function");
  });
});
