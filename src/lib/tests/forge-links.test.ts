import { describe, expect, it } from "vitest";
import { getCommitUrl, parseRemoteUrl } from "../forge-links";

describe("forge-links", () => {
  describe("parseRemoteUrl", () => {
    it("should parse GitHub SSH URLs", () => {
      const parsed = parseRemoteUrl(
        "git@github.com:salvatorecorvaglia/basilico.git",
      );
      expect(parsed).toEqual({
        provider: "github",
        owner: "salvatorecorvaglia",
        repo: "basilico",
        webBaseUrl: "https://github.com/salvatorecorvaglia/basilico",
      });
    });

    it("should parse GitHub HTTPS URLs", () => {
      const parsed = parseRemoteUrl(
        "https://github.com/salvatorecorvaglia/basilico",
      );
      expect(parsed).toEqual({
        provider: "github",
        owner: "salvatorecorvaglia",
        repo: "basilico",
        webBaseUrl: "https://github.com/salvatorecorvaglia/basilico",
      });
    });

    it("should parse GitLab SSH URLs", () => {
      const parsed = parseRemoteUrl("git@gitlab.com:org/project.git");
      expect(parsed).toEqual({
        provider: "gitlab",
        owner: "org",
        repo: "project",
        webBaseUrl: "https://gitlab.com/org/project",
      });
    });

    it("should return null for empty or invalid remote URLs", () => {
      expect(parseRemoteUrl("")).toBeNull();
      expect(parseRemoteUrl("invalid-remote-url")).toBeNull();
    });
  });

  describe("getCommitUrl", () => {
    it("should generate proper GitHub commit URL", () => {
      const url = getCommitUrl(
        "git@github.com:salvatorecorvaglia/basilico.git",
        "abc1234",
      );
      expect(url).toBe(
        "https://github.com/salvatorecorvaglia/basilico/commit/abc1234",
      );
    });

    it("should generate proper GitLab commit URL", () => {
      const url = getCommitUrl("git@gitlab.com:org/project.git", "abc1234");
      expect(url).toBe("https://gitlab.com/org/project/-/commit/abc1234");
    });
  });
});
