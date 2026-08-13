import { describe, expect, it } from "vitest";
import { validateBranchName, validateTagName } from "../../src/lib/git-validation";

describe("git-validation", () => {
  describe("validateBranchName", () => {
    it("should accept valid branch names", () => {
      expect(validateBranchName("main")).toBeNull();
      expect(validateBranchName("feature/login")).toBeNull();
      expect(validateBranchName("fix/bug-123")).toBeNull();
      expect(validateBranchName("v1.0.0")).toBeNull();
    });

    it("should reject empty or whitespace branch names", () => {
      expect(validateBranchName("")).toBe("Branch name cannot be empty.");
      expect(validateBranchName("   ")).toBe("Branch name cannot be empty.");
      expect(validateBranchName(" main")).toBe(
        "Branch name cannot start or end with spaces.",
      );
      expect(validateBranchName("main ")).toBe(
        "Branch name cannot start or end with spaces.",
      );
    });

    it("should reject leading or trailing slashes and consecutive slashes", () => {
      expect(validateBranchName("/main")).toBe(
        'Branch name cannot start or end with "/".',
      );
      expect(validateBranchName("main/")).toBe(
        'Branch name cannot start or end with "/".',
      );
      expect(validateBranchName("feature//login")).toBe(
        'Branch name cannot contain consecutive slashes "//".',
      );
    });

    it("should reject invalid Git characters and sequences", () => {
      expect(validateBranchName("feature..branch")).toBe(
        'Branch name cannot contain "..".',
      );
      expect(validateBranchName("branch.")).toBe(
        'Branch name cannot end with ".".',
      );
      expect(validateBranchName("branch.lock")).toBe(
        'Branch name cannot end with ".lock".',
      );
      expect(validateBranchName("branch@{1}")).toBe(
        'Branch name cannot contain "@{".',
      );
      expect(validateBranchName("@")).toBe('Branch name cannot be "@".');
      expect(validateBranchName("feature name")).toBe(
        "Branch name cannot contain spaces.",
      );
      expect(validateBranchName("feature~1")).toBe(
        'Branch name cannot contain the character "~".',
      );
      expect(validateBranchName("feature^2")).toBe(
        'Branch name cannot contain the character "^".',
      );
      expect(validateBranchName("feature:main")).toBe(
        'Branch name cannot contain the character ":".',
      );
    });

    it("should reject path components starting with dot", () => {
      expect(validateBranchName(".feature")).toBe(
        'Branch name component cannot start with "." (found in ".feature").',
      );
      expect(validateBranchName("fix/.bug")).toBe(
        'Branch name component cannot start with "." (found in ".bug").',
      );
    });
  });

  describe("validateTagName", () => {
    it("should accept valid tag names", () => {
      expect(validateTagName("v1.0.0")).toBeNull();
      expect(validateTagName("release-2026.07")).toBeNull();
    });

    it("should reject invalid tag names with proper error message prefix", () => {
      expect(validateTagName("")).toBe("Tag name cannot be empty.");
      expect(validateTagName("v1..0")).toBe('Tag name cannot contain "..".');
    });
  });
});
