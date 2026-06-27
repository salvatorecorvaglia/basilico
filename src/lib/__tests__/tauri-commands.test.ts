import { describe, expect, it } from "vitest";
import { parseAppError } from "../tauri-commands";

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
