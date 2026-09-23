import { describe, expect, it } from "vitest";
import { matchesShortcut, parseShortcut } from "../../src/lib/shortcuts";

describe("shortcuts", () => {
  it("should parse shortcut strings into structured configs", () => {
    expect(parseShortcut("CmdOrCtrl+Shift+P")).toEqual({
      cmdOrCtrl: true,
      shift: true,
      alt: false,
      key: "p",
    });

    expect(parseShortcut("CmdOrCtrl+K")).toEqual({
      cmdOrCtrl: true,
      shift: false,
      alt: false,
      key: "k",
    });
  });

  it("should match KeyboardEvent correctly", () => {
    const mockEvent = (key: string, metaKey = false, shiftKey = false) =>
      ({
        key,
        metaKey,
        shiftKey,
        ctrlKey: false,
        altKey: false,
      }) as KeyboardEvent;

    expect(
      matchesShortcut(mockEvent("p", true, true), "CmdOrCtrl+Shift+P"),
    ).toBe(true);
    expect(
      matchesShortcut(mockEvent("p", true, false), "CmdOrCtrl+Shift+P"),
    ).toBe(false);
    expect(matchesShortcut(mockEvent("k", true, false), "CmdOrCtrl+K")).toBe(
      true,
    );
  });
});
