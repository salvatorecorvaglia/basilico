// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiffHunkInfo, DiffLineInfo } from "../../src/lib/git-types";
import { constructHunkPatch } from "../../src/lib/hunk-patch";

/**
 * `hunk-patch.test.ts` checks the *shape* of generated patches. That can pass
 * while git still rejects the patch, so these tests apply each one to a real
 * index with `git apply --cached` and check the resulting blob.
 */

let repo: string;

function git(...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function applyToIndex(patch: string) {
  const patchPath = join(repo, "..", `${Date.now()}-${Math.random()}.patch`);
  writeFileSync(patchPath, patch);
  try {
    git("apply", "--cached", patchPath);
  } finally {
    rmSync(patchPath, { force: true });
  }
}

function indexContent(path: string): string {
  return git("show", `:${path}`);
}

function line(
  origin: string,
  content: string,
  oldLineno: number | null,
  newLineno: number | null,
): DiffLineInfo {
  return { origin, content: `${content}\n`, oldLineno, newLineno };
}

/** Old side: ctx-a, removed, ctx-b. New side: ctx-a, added-1, added-2, ctx-b. */
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

const OLD = "ctx-a\nremoved\nctx-b\n";
const NEW = "ctx-a\nadded-1\nadded-2\nctx-b\n";

describe("constructHunkPatch — applied by git", () => {
  beforeEach(() => {
    const parent = mkdtempSync(join(tmpdir(), "basilico-hunk-"));
    repo = join(parent, "repo");
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(join(repo, "f.txt"), OLD);
    git("add", "f.txt");
    git("commit", "-q", "-m", "base");
  });

  afterEach(() => {
    rmSync(join(repo, ".."), { recursive: true, force: true });
  });

  it("stages a whole hunk", () => {
    applyToIndex(constructHunkPatch("f.txt", sampleHunk()));
    expect(indexContent("f.txt")).toBe(NEW);
  });

  it("stages only the selected addition", () => {
    applyToIndex(constructHunkPatch("f.txt", sampleHunk(), new Set([2])));
    expect(indexContent("f.txt")).toBe("ctx-a\nremoved\nadded-1\nctx-b\n");
  });

  it("unstages a whole staged hunk", () => {
    writeFileSync(join(repo, "f.txt"), NEW);
    git("add", "f.txt");

    applyToIndex(constructHunkPatch("f.txt", sampleHunk(), undefined, true));
    expect(indexContent("f.txt")).toBe(OLD);
  });

  it("unstages only the selected addition", () => {
    writeFileSync(join(repo, "f.txt"), NEW);
    git("add", "f.txt");

    applyToIndex(constructHunkPatch("f.txt", sampleHunk(), new Set([3]), true));
    expect(indexContent("f.txt")).toBe("ctx-a\nadded-1\nctx-b\n");
  });

  // B16: an untracked file's diff has an empty pre-image. Without a
  // `new file mode` header and a `/dev/null` source, git looks for the path in
  // the index, finds nothing, and rejects the patch.
  it("stages lines of an untracked file", () => {
    const hunk: DiffHunkInfo = {
      header: "@@ -0,0 +1,2 @@",
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 2,
      lines: [line("+", "x", null, 1), line("+", "y", null, 2)],
    };
    writeFileSync(join(repo, "new.txt"), "x\ny\n");

    applyToIndex(
      constructHunkPatch("new.txt", hunk, new Set([0]), false, true),
    );
    expect(indexContent("new.txt")).toBe("x\n");
  });
});
