import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatRelativeTime,
  getDirectory,
  getFileExtension,
  getFileName,
  getInitials,
  getStatusColor,
  getStatusIcon,
  shortOid,
  stringToColor,
  truncate,
} from "../utils";

describe("utils", () => {
  describe("formatRelativeTime", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(1700000000 * 1000)); // Fixed mock time
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should format short times as just now or minutes ago", () => {
      expect(formatRelativeTime(1700000000 - 10)).toBe("just now");
      expect(formatRelativeTime(1700000000 - 120)).toBe("2m ago");
    });

    it("should format hours, days, weeks, months, years ago", () => {
      expect(formatRelativeTime(1700000000 - 7200)).toBe("2h ago");
      expect(formatRelativeTime(1700000000 - 172800)).toBe("2d ago");
      expect(formatRelativeTime(1700000000 - 604800 * 2)).toBe("2w ago");
      expect(formatRelativeTime(1700000000 - 2592000 * 2)).toBe("2mo ago");
      expect(formatRelativeTime(1700000000 - 31536000 * 2)).toBe("2y ago");
    });
  });

  describe("getInitials", () => {
    it("should extract initials correctly", () => {
      expect(getInitials("John Doe")).toBe("JD");
      expect(getInitials("Jane")).toBe("J");
      expect(getInitials("")).toBe("");
      expect(getInitials("Multiple Name Parts Here")).toBe("MN");
    });
  });

  describe("stringToColor", () => {
    it("should return a consistent HSL color", () => {
      expect(stringToColor("hello")).toContain("hsl(");
      expect(stringToColor("hello")).toBe(stringToColor("hello"));
      expect(stringToColor("world")).not.toBe(stringToColor("hello"));
    });
  });

  describe("truncate", () => {
    it("should truncate with ellipsis if longer than maxLen", () => {
      expect(truncate("hello world", 5)).toBe("hell…");
      expect(truncate("hello", 10)).toBe("hello");
    });
  });

  describe("shortOid", () => {
    it("should return first 7 characters of OID", () => {
      expect(shortOid("1234567890abcdef")).toBe("1234567");
    });
  });

  describe("getFileExtension", () => {
    it("should return the extension", () => {
      expect(getFileExtension("foo.bar.ts")).toBe("ts");
      expect(getFileExtension("noextension")).toBe("");
    });
  });

  describe("getFileName", () => {
    it("should return file name from path", () => {
      expect(getFileName("src/components/WelcomeScreen.tsx")).toBe(
        "WelcomeScreen.tsx",
      );
      expect(getFileName("WelcomeScreen.tsx")).toBe("WelcomeScreen.tsx");
    });
  });

  describe("getDirectory", () => {
    it("should return directory path", () => {
      expect(getDirectory("src/components/WelcomeScreen.tsx")).toBe(
        "src/components",
      );
      expect(getDirectory("WelcomeScreen.tsx")).toBe("");
    });
  });

  describe("getStatusIcon", () => {
    it("should match git status classifications", () => {
      expect(getStatusIcon("added")).toBe("A");
      expect(getStatusIcon("modified")).toBe("M");
      expect(getStatusIcon("deleted")).toBe("D");
      expect(getStatusIcon("renamed")).toBe("R");
      expect(getStatusIcon("copied")).toBe("C");
      expect(getStatusIcon("other")).toBe("?");
    });
  });

  describe("getStatusColor", () => {
    it("should map status to CSS variables", () => {
      expect(getStatusColor("added")).toBe("var(--color-success)");
      expect(getStatusColor("modified")).toBe("var(--color-warning)");
      expect(getStatusColor("deleted")).toBe("var(--color-danger)");
      expect(getStatusColor("renamed")).toBe("var(--color-info)");
      expect(getStatusColor("unknown")).toBe("var(--text-secondary)");
    });
  });
});
