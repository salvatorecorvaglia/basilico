import { describe, expect, it } from "vitest";
import {
  buildStagingRows,
  stagingSections,
} from "../../../src/components/staging/use-staging-rows";
import type { RepoStatus } from "../../../src/lib/git-types";

function status(overrides: Partial<RepoStatus> = {}): RepoStatus {
  return {
    branch: "main",
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    state: "Clean",
    ...overrides,
  };
}

const kinds = (rows: { kind: string }[]) => rows.map((r) => r.kind);

describe("buildStagingRows", () => {
  it("emits the conflict section only when there are conflicts", () => {
    const clean = buildStagingRows(stagingSections(status()), true, true);
    expect(kinds(clean)).not.toContain("header-conflicted");

    const conflicted = buildStagingRows(
      stagingSections(status({ conflicted: ["a.ts"] })),
      true,
      true,
    );
    expect(kinds(conflicted).slice(0, 2)).toEqual([
      "header-conflicted",
      "conflicted-file",
    ]);
  });

  it("orders unstaged files before untracked ones", () => {
    const rows = buildStagingRows(
      stagingSections(
        status({
          unstaged: [
            { path: "changed.ts", status: "modified", isStaged: false },
          ],
          untracked: ["new.ts"],
        }),
      ),
      true,
      true,
    );
    const fileKinds = kinds(rows).filter((k) => k.endsWith("-file"));
    expect(fileKinds).toEqual(["unstaged-file", "untracked-file"]);
  });

  it("counts untracked files in the unstaged header", () => {
    const rows = buildStagingRows(
      stagingSections(
        status({
          unstaged: [{ path: "a.ts", status: "modified", isStaged: false }],
          untracked: ["b.ts", "c.ts"],
        }),
      ),
      true,
      true,
    );
    const header = rows.find((r) => r.kind === "header-unstaged");
    expect(header).toMatchObject({ count: 3 });
  });

  it("hides a section's files when it is collapsed but keeps its header", () => {
    const sections = stagingSections(
      status({
        staged: [{ path: "a.ts", status: "modified", isStaged: true }],
        unstaged: [{ path: "b.ts", status: "modified", isStaged: false }],
      }),
    );

    const collapsed = buildStagingRows(sections, false, false);
    expect(kinds(collapsed)).toEqual(["header-staged", "header-unstaged"]);

    const expanded = buildStagingRows(sections, true, true);
    expect(kinds(expanded)).toEqual([
      "header-staged",
      "staged-file",
      "header-unstaged",
      "unstaged-file",
    ]);
  });

  it("shows an empty placeholder for an expanded but empty section", () => {
    const rows = buildStagingRows(stagingSections(status()), true, true);
    expect(kinds(rows)).toEqual([
      "header-staged",
      "empty-staged",
      "header-unstaged",
      "empty-unstaged",
    ]);
  });

  it("gives every row a unique key", () => {
    const rows = buildStagingRows(
      stagingSections(
        status({
          conflicted: ["c.ts"],
          staged: [{ path: "a.ts", status: "modified", isStaged: true }],
          unstaged: [{ path: "a.ts", status: "modified", isStaged: false }],
          untracked: ["b.ts"],
        }),
      ),
      true,
      true,
    );
    const ids = rows.map((r) => r.id);
    // The same path can legitimately appear as both staged and unstaged, so
    // the section prefix is what keeps the virtualizer's keys distinct.
    expect(new Set(ids).size).toBe(ids.length);
  });
});
