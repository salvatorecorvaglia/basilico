import { describe, expect, it } from "vitest";
import { describeRepoState } from "../../src/lib/repo-state";

describe("describeRepoState", () => {
  it("is null when nothing is in progress", () => {
    expect(describeRepoState("Clean")).toBeNull();
    expect(describeRepoState(null)).toBeNull();
    expect(describeRepoState(undefined)).toBeNull();
  });

  it("names the operation in words", () => {
    expect(describeRepoState("Merge")).toBe("Merging");
    expect(describeRepoState("CherryPickSequence")).toBe("Cherry-picking");
    expect(describeRepoState("RebaseMerge")).toBe("Rebasing");
    expect(describeRepoState("ApplyMailbox")).toBe("Applying patches");
  });

  it("shows an unrecognised state rather than hiding it", () => {
    expect(describeRepoState("SomethingNew")).toBe("SomethingNew");
  });
});
