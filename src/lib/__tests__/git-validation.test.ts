import { describe, expect, it } from "vitest";
import { validateBranchName, validateTagName } from "../git-validation";

describe("validateBranchName", () => {
  describe("valid branch names", () => {
    it.each([
      "main",
      "feature/login",
      "fix/issue-123",
      "release/v1.0.0",
      "my-branch",
      "my_branch",
      "UPPER-CASE",
      "a/b/c/d",
      "feature/add-日本語",
    ])('should accept "%s"', (name) => {
      expect(validateBranchName(name)).toBeNull();
    });
  });

  describe("invalid branch names", () => {
    it("should reject empty string", () => {
      expect(validateBranchName("")).not.toBeNull();
    });

    it("should reject whitespace-only string", () => {
      expect(validateBranchName("   ")).not.toBeNull();
    });

    it("should reject names with leading/trailing spaces", () => {
      expect(validateBranchName(" feature")).not.toBeNull();
      expect(validateBranchName("feature ")).not.toBeNull();
    });

    it("should reject names containing spaces", () => {
      const result = validateBranchName("my branch");
      expect(result).not.toBeNull();
      expect(result).toContain("space");
    });

    it('should reject names containing ".."', () => {
      const result = validateBranchName("feature..branch");
      expect(result).not.toBeNull();
      expect(result).toContain("..");
    });

    it("should reject names starting with /", () => {
      expect(validateBranchName("/feature")).not.toBeNull();
    });

    it("should reject names ending with /", () => {
      expect(validateBranchName("feature/")).not.toBeNull();
    });

    it("should reject names containing //", () => {
      expect(validateBranchName("feature//branch")).not.toBeNull();
    });

    it("should reject names ending with .", () => {
      expect(validateBranchName("feature.")).not.toBeNull();
    });

    it("should reject names ending with .lock", () => {
      expect(validateBranchName("feature.lock")).not.toBeNull();
    });

    it('should reject names containing "@{"', () => {
      expect(validateBranchName("feature@{1}")).not.toBeNull();
    });

    it('should reject single "@"', () => {
      expect(validateBranchName("@")).not.toBeNull();
    });

    it.each([
      "~",
      "^",
      ":",
      "?",
      "[",
      "\\",
      "*",
    ])('should reject names containing "%s"', (char) => {
      expect(validateBranchName(`feature${char}branch`)).not.toBeNull();
    });

    it("should reject control characters", () => {
      expect(validateBranchName("feature\x01branch")).not.toBeNull();
    });

    it("should reject component starting with .", () => {
      expect(validateBranchName("feature/.hidden")).not.toBeNull();
    });
  });
});

describe("validateTagName", () => {
  describe("valid tag names", () => {
    it.each([
      "v1.0.0",
      "release-v1",
      "v2.0.0-beta.1",
      "latest",
      "tags/v1.0",
    ])('should accept "%s"', (name) => {
      expect(validateTagName(name)).toBeNull();
    });
  });

  describe("invalid tag names", () => {
    it("should reject empty string", () => {
      expect(validateTagName("")).not.toBeNull();
    });

    it("should reject names containing spaces", () => {
      expect(validateTagName("v1.0 0")).not.toBeNull();
    });

    it('should reject names containing ".."', () => {
      expect(validateTagName("v1..0")).not.toBeNull();
    });

    it("should reject names ending with .lock", () => {
      expect(validateTagName("v1.lock")).not.toBeNull();
    });
  });
});
