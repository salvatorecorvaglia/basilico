import { describe, expect, it } from "vitest";
import type { DiffHunkInfo, DiffLineInfo } from "../../src/lib/git-types";
import { constructHunkPatch } from "../../src/lib/hunk-patch";

function line(
  origin: string,
  content: string,
  oldLineno: number | null,
  newLineno: number | null,
): DiffLineInfo {
  return { origin, content: `${content}\n`, oldLineno, newLineno };
}

/**
 * A hunk that removes one line, adds two, and keeps two as context:
 *
 *   ctx-a       (old 1 / new 1)
 *   -removed    (old 2)
 *   +added-1    (new 2)
 *   +added-2    (new 3)
 *   ctx-b       (old 3 / new 4)
 *
 * old side: ctx-a, removed, ctx-b            → 3 lines from old line 1
 * new side: ctx-a, added-1, added-2, ctx-b   → 4 lines from new line 1
 */
function sampleHunk(): DiffHunkInfo {
  return {
    header: "@@ -1,3 +1,4 @@",
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 4,
    lines: [
      line(" ", "ctx-a", 1, 1),
      line("-", "removed", 2, null),
      line("+", "added-1", null, 2),
      line("+", "added-2", null, 3),
      line(" ", "ctx-b", 3, 4),
    ],
  };
}

/** `@@ -a,b +c,d @@` → `[a, b, c, d]` */
function parseHeader(patch: string): [number, number, number, number] {
  const match = patch.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/m);
  if (!match) throw new Error(`no hunk header in patch:\n${patch}`);
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
  ];
}

/** Count body lines that appear on the old side and on the new side. */
function countBody(patch: string): { old: number; new: number } {
  const body = patch.split(/^@@.*@@\n/m)[1] ?? "";
  let oldCount = 0;
  let newCount = 0;
  for (const l of body.split("\n")) {
    if (l === "" || l.startsWith("\\")) continue;
    if (l.startsWith(" ")) {
      oldCount++;
      newCount++;
    } else if (l.startsWith("-")) {
      oldCount++;
    } else if (l.startsWith("+")) {
      newCount++;
    }
  }
  return { old: oldCount, new: newCount };
}

/** The header's declared counts must match what the body actually contains. */
function expectHeaderMatchesBody(patch: string) {
  const [, oldCount, , newCount] = parseHeader(patch);
  expect(countBody(patch)).toEqual({ old: oldCount, new: newCount });
}

describe("constructHunkPatch — forward (staging)", () => {
  it("reproduces the whole hunk when no lines are selected out", () => {
    const patch = constructHunkPatch("src/a.ts", sampleHunk());

    expect(parseHeader(patch)).toEqual([1, 3, 1, 4]);
    expectHeaderMatchesBody(patch);
    expect(patch).toContain("-removed\n");
    expect(patch).toContain("+added-1\n");
    expect(patch).toContain("+added-2\n");
  });

  it("keeps an unselected deletion as context and drops an unselected addition", () => {
    // Select only "added-1" (index 2).
    const patch = constructHunkPatch("src/a.ts", sampleHunk(), new Set([2]));

    // The unselected deletion survives in both images, so the old side is
    // unchanged at 3 and the new side is ctx-a + removed + added-1 + ctx-b.
    expect(parseHeader(patch)).toEqual([1, 3, 1, 4]);
    expectHeaderMatchesBody(patch);
    expect(patch).toContain(" removed\n");
    expect(patch).not.toContain("-removed\n");
    expect(patch).toContain("+added-1\n");
    expect(patch).not.toContain("added-2");
  });
});

describe("constructHunkPatch — reverse (unstaging)", () => {
  it("inverts the whole hunk, swapping the header's start offsets", () => {
    const patch = constructHunkPatch("src/a.ts", sampleHunk(), undefined, true);

    // Pre-image is now the new side (4 lines), post-image the old side (3).
    expect(parseHeader(patch)).toEqual([1, 4, 1, 3]);
    expectHeaderMatchesBody(patch);
    expect(patch).toContain("+removed\n");
    expect(patch).toContain("-added-1\n");
    expect(patch).toContain("-added-2\n");
  });

  it("keeps an unselected addition as context and drops an unselected deletion", () => {
    // Select only "added-1" (index 2): undo that one addition, nothing else.
    const patch = constructHunkPatch(
      "src/a.ts",
      sampleHunk(),
      new Set([2]),
      true,
    );

    // Pre-image is the index: ctx-a, added-1, added-2, ctx-b → 4 lines.
    // Post-image drops added-1 only → 3 lines.
    expect(parseHeader(patch)).toEqual([1, 4, 1, 3]);
    expectHeaderMatchesBody(patch);

    // The unselected addition is in both images, so it must be context —
    // not omitted, which is what the forward rule used to do here.
    expect(patch).toContain(" added-2\n");
    expect(patch).toContain("-added-1\n");

    // The unselected deletion is in neither image and must not appear at all.
    // Emitting it as context (the old behaviour) made the patch unappliable.
    expect(patch).not.toContain("removed");
  });

  it("restores a selected deletion while leaving unselected additions in place", () => {
    // Select only "removed" (index 1).
    const patch = constructHunkPatch(
      "src/a.ts",
      sampleHunk(),
      new Set([1]),
      true,
    );

    // Pre-image: ctx-a, added-1, added-2, ctx-b → 4.
    // Post-image: the same, plus the restored line → 5.
    expect(parseHeader(patch)).toEqual([1, 4, 1, 5]);
    expectHeaderMatchesBody(patch);
    expect(patch).toContain("+removed\n");
    expect(patch).toContain(" added-1\n");
    expect(patch).toContain(" added-2\n");
  });
});

describe("constructHunkPatch — file trailer", () => {
  it("terminates a final line that has no newline of its own", () => {
    const hunk: DiffHunkInfo = {
      header: "@@ -1,1 +1,1 @@",
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: [
        { origin: "-", content: "before", oldLineno: 1, newLineno: null },
        { origin: "+", content: "after", oldLineno: null, newLineno: 1 },
      ],
    };

    const patch = constructHunkPatch("src/a.ts", hunk);

    // Without the explicit terminator the two lines concatenate into
    // "-before+after", which is not a patch git can read.
    expect(patch).toContain("-before\n\\ No newline at end of file\n");
    expect(patch).toContain("+after\n\\ No newline at end of file\n");
    expectHeaderMatchesBody(patch);
  });
});
