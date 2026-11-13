import { describe, expect, it } from "vitest";
import {
  hasConflictMarkers,
  parseConflictBlocks,
} from "../../src/lib/conflict-blocks";

describe("Git conflict parsing", () => {
  it.each([1, 2, 3, 7, 9])(
    "separates diff3 ancestor content with marker size %i",
    (size) => {
      const content = [
        `${"<".repeat(size)} ours`,
        "our content",
        `${"|".repeat(size)} ancestor`,
        "base content",
        "=".repeat(size),
        "their content",
        `${">".repeat(size)} theirs`,
      ].join("\n");
      expect(parseConflictBlocks(content, size)).toEqual([
        {
          start: 0,
          sep: 4,
          end: 6,
          ours: "our content",
          theirs: "their content",
        },
      ]);
      expect(hasConflictMarkers(content, size)).toBe(true);
    },
  );
  it("does not offer malformed or incomplete blocks for automatic resolution", () => {
    for (const text of [
      "<<<<<<< ours\nunfinished",
      "<<<<<<< ours\nx\n=========\ny\n>>>>>>> theirs",
      "<<<<<<< ours\nx\n||||||| base\nb\n>>>>>>> theirs",
    ]) {
      expect(parseConflictBlocks(text)).toEqual([]);
      expect(hasConflictMarkers(text)).toBe(true);
    }
    expect(hasConflictMarkers("Heading\n=======\nordinary text")).toBe(false);
  });
});

it.each([
  "<<<<<<< outer\n<<<<<<< nested\na\n=======\nb\n>>>>>>> end",
  "<<<<<<< ours\na\n||||||| first base\nb\n||||||| second base\nc\n=======\nd\n>>>>>>> theirs",
  "<<<<<<< ours\na\n=======\nb\n=======\nc\n>>>>>>> theirs",
  "<<<<<<< ours\na\n=======\nb\n||||||| misplaced base\nc\n>>>>>>> theirs",
  "<<<<<<< ours\na\n>>>>>>> theirs",
])(
  "never auto-resolves malformed markers and recovers at the next complete block",
  (malformed) => {
    const valid =
      "<<<<<<< ours\nkept ours\n=======\nkept theirs\n>>>>>>> theirs";
    const text = `${malformed}\nordinary text\n${valid}`;
    const blocks = parseConflictBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].ours).toBe("kept ours");
    expect(blocks[0].theirs).toBe("kept theirs");
    expect(text.split("\n")[blocks[0].start]).toBe("<<<<<<< ours");
    expect(text.split("\n")[blocks[0].end]).toBe(">>>>>>> theirs");
  },
);

it("does not interpret short comparison or quotation lines as default conflict markers", () => {
  const text =
    "< quoted\ncontent\n=\ncontent\n> quoted\n<< comparison\n>> comparison";
  expect(parseConflictBlocks(text)).toEqual([]);
  expect(hasConflictMarkers(text)).toBe(false);
});
