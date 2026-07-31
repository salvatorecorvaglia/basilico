/* ═══════════════════════════════════════════════════════
   Basilico — Forge Links Unit Tests
   ═══════════════════════════════════════════════════════ */

import { describe, expect, it } from "vitest";
import {
  getBranchUrl,
  getCommitUrl,
  getCreatePrUrl,
  getFileBlameUrl,
  parseAutolinks,
  parseRemoteUrl,
} from "../../lib/forge-links";

describe("parseRemoteUrl", () => {
  it("should parse GitHub HTTPS remote URL", () => {
    const res = parseRemoteUrl(
      "https://github.com/salvatorecorvaglia/basilico.git",
    );
    expect(res).toEqual({
      provider: "github",
      owner: "salvatorecorvaglia",
      repo: "basilico",
      webBaseUrl: "https://github.com/salvatorecorvaglia/basilico",
    });
  });

  it("should parse GitHub SSH remote URL", () => {
    const res = parseRemoteUrl(
      "git@github.com:salvatorecorvaglia/basilico.git",
    );
    expect(res).toEqual({
      provider: "github",
      owner: "salvatorecorvaglia",
      repo: "basilico",
      webBaseUrl: "https://github.com/salvatorecorvaglia/basilico",
    });
  });

  it("should parse GitLab HTTPS remote URL", () => {
    const res = parseRemoteUrl("https://gitlab.com/group/subgroup/project.git");
    expect(res).not.toBeNull();
    expect(res?.provider).toBe("gitlab");
  });
});

describe("deep link generators", () => {
  const remote = "git@github.com:salvatorecorvaglia/basilico.git";

  it("should build commit URL", () => {
    expect(getCommitUrl(remote, "abc1234")).toBe(
      "https://github.com/salvatorecorvaglia/basilico/commit/abc1234",
    );
  });

  it("should build branch URL", () => {
    expect(getBranchUrl(remote, "feature/test")).toBe(
      "https://github.com/salvatorecorvaglia/basilico/tree/feature%2Ftest",
    );
  });

  it("should build file blame URL", () => {
    expect(getFileBlameUrl(remote, "main", "src/App.tsx", 15)).toBe(
      "https://github.com/salvatorecorvaglia/basilico/blame/main/src/App.tsx#L15",
    );
  });

  it("should build create PR URL", () => {
    expect(getCreatePrUrl(remote, "feature/my-branch", "main")).toBe(
      "https://github.com/salvatorecorvaglia/basilico/compare/main...feature%2Fmy-branch?expand=1",
    );
  });
});

describe("parseAutolinks", () => {
  it("should parse default #123 issue tokens with remote URL", () => {
    const tokens = parseAutolinks(
      "Fix bug #42 and update docs #108",
      null,
      null,
      "https://github.com/owner/repo",
    );
    expect(tokens).toHaveLength(4);
    expect(tokens[1]).toEqual({
      text: "#42",
      url: "https://github.com/owner/repo/issues/42",
    });
    expect(tokens[3]).toEqual({
      text: "#108",
      url: "https://github.com/owner/repo/issues/108",
    });
  });
});
