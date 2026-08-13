import { describe, expect, it } from "vitest";
import { buildAutolinkSegments } from "../../src/lib/autolink";

const ISSUE_URL = "https://example.com/issues/$1";

describe("buildAutolinkSegments", () => {
  it("returns the message untouched when no pattern is configured", () => {
    expect(buildAutolinkSegments("plain message", null, ISSUE_URL)).toEqual([
      { text: "plain message" },
    ]);
    expect(buildAutolinkSegments("plain message", "#(\\d+)", null)).toEqual([
      { text: "plain message" },
    ]);
  });

  it("links a reference and keeps the surrounding text", () => {
    const segments = buildAutolinkSegments(
      "fix crash #123 in parser",
      "#(\\d+)",
      ISSUE_URL,
    );
    expect(segments).toEqual([
      { text: "fix crash " },
      { text: "#123", url: "https://example.com/issues/123" },
      { text: " in parser" },
    ]);
  });

  it("links every occurrence", () => {
    const segments = buildAutolinkSegments("#1 and #2", "#(\\d+)", ISSUE_URL);
    expect(segments.filter((s) => s.url)).toEqual([
      { text: "#1", url: "https://example.com/issues/1" },
      { text: "#2", url: "https://example.com/issues/2" },
    ]);
  });

  it("substitutes multiple capture groups", () => {
    const segments = buildAutolinkSegments(
      "see ABC-42 now",
      "([A-Z]+)-(\\d+)",
      "https://example.com/$1/$2",
    );
    expect(segments.find((s) => s.url)).toEqual({
      text: "ABC-42",
      url: "https://example.com/ABC/42",
    });
  });

  it("uses the whole match for $1 when the pattern has no capture group", () => {
    const segments = buildAutolinkSegments("see PR7 now", "PR\\d+", ISSUE_URL);
    expect(segments.find((s) => s.url)).toEqual({
      text: "PR7",
      url: "https://example.com/issues/PR7",
    });
  });

  // The regression that motivated extracting this: a pattern able to match the
  // empty string previously spun forever inside the render path and froze the
  // whole UI. If this test ever hangs, that bug is back.
  it("terminates on a pattern that can match the empty string", () => {
    const patterns = ["#?\\d*", "[A-Z]*-\\d*", "x*", "(?:)"];
    for (const pattern of patterns) {
      const segments = buildAutolinkSegments(
        "some commit #12 message",
        pattern,
        ISSUE_URL,
      );
      // Whatever it links, the original text must be preserved in order.
      expect(segments.map((s) => s.text).join("")).toBe(
        "some commit #12 message",
      );
    }
  });

  it("falls back to plain text on an invalid regex", () => {
    expect(buildAutolinkSegments("msg", "([unclosed", ISSUE_URL)).toEqual([
      { text: "msg" },
    ]);
  });

  it("preserves an empty message", () => {
    expect(buildAutolinkSegments("", "#(\\d+)", ISSUE_URL)).toEqual([]);
  });
});
