import { describe, expect, it, vi } from "vitest";
import {
  fetchGitHubCiStatus,
  getCommitUrl,
  parseRemoteUrl,
} from "../../src/lib/forge-links";

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
        host: "github.com",
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
        host: "github.com",
      });
    });

    it("should parse GitLab SSH URLs", () => {
      const parsed = parseRemoteUrl("git@gitlab.com:org/project.git");
      expect(parsed).toEqual({
        provider: "gitlab",
        owner: "org",
        repo: "project",
        webBaseUrl: "https://gitlab.com/org/project",
        host: "gitlab.com",
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

describe("forge-links — hosts that are not github.com", () => {
  it("classifies a self-hosted GitLab as gitlab, not github", () => {
    const parsed = parseRemoteUrl("git@gitlab.company.internal:team/api.git");
    expect(parsed?.provider).toBe("gitlab");
    expect(
      getCommitUrl("git@gitlab.company.internal:team/api.git", "abc1234"),
    ).toBe("https://gitlab.company.internal/team/api/-/commit/abc1234");
  });

  it("classifies an unrecognised forge as generic rather than github", () => {
    // Previously every unknown host fell through to "github", so a Gitea
    // instance was treated as a GitHub repository throughout the app.
    const parsed = parseRemoteUrl("https://git.example.org/team/api.git");
    expect(parsed?.provider).toBe("generic");
    expect(parsed?.host).toBe("git.example.org");
  });

  it("does not treat a host merely containing 'github' as github.com", () => {
    const parsed = parseRemoteUrl("https://github.evil.example/owner/repo");
    expect(parsed?.provider).toBe("generic");
  });

  it("never calls the GitHub API for a non-github.com remote", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = await fetchGitHubCiStatus(
        "git@gitlab.company.internal:team/api.git",
        "main",
        "ghp_secret_token",
      );
      expect(result).toEqual({ status: "unknown" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("encodes the owner and repo segments of the API URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workflow_runs: [] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await fetchGitHubCiStatus(
        "https://github.com/owner/nested/repo",
        "feature/x",
      );
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        "https://api.github.com/repos/owner/nested%2Frepo/actions/runs?branch=feature%2Fx&per_page=1",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
