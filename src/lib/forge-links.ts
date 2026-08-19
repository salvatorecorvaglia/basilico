/* ═══════════════════════════════════════════════════════
   Basilico — Forge Deep Links & CI/CD Status Utilities
   GitHub, GitLab, Bitbucket deep links, autolink parser, and GitHub Actions status
   ═══════════════════════════════════════════════════════ */

export type ForgeProvider = "github" | "gitlab" | "bitbucket" | "generic";

export interface ParsedForge {
  provider: ForgeProvider;
  owner: string;
  repo: string;
  webBaseUrl: string;
}

export function parseRemoteUrl(remoteUrl: string): ParsedForge | null {
  if (!remoteUrl) return null;

  let cleaned = remoteUrl.trim();
  // Strip trailing .git
  if (cleaned.endsWith(".git")) {
    cleaned = cleaned.slice(0, -4);
  }

  // Handle SSH format: git@github.com:owner/repo
  if (cleaned.startsWith("git@")) {
    const parts = cleaned.slice(4).split(":");
    if (parts.length === 2) {
      const host = parts[0];
      const pathParts = parts[1].split("/");
      if (pathParts.length >= 2) {
        const owner = pathParts[0];
        const repo = pathParts.slice(1).join("/");
        const provider: ForgeProvider = host.includes("gitlab")
          ? "gitlab"
          : host.includes("bitbucket")
            ? "bitbucket"
            : "github";
        return {
          provider,
          owner,
          repo,
          webBaseUrl: `https://${host}/${owner}/${repo}`,
        };
      }
    }
  }

  // Handle HTTPS format: https://github.com/owner/repo
  try {
    const url = new URL(cleaned);
    const host = url.hostname;
    const pathParts = url.pathname.replace(/^\//, "").split("/");
    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts.slice(1).join("/");
      const provider: ForgeProvider = host.includes("gitlab")
        ? "gitlab"
        : host.includes("bitbucket")
          ? "bitbucket"
          : "github";
      return {
        provider,
        owner,
        repo,
        webBaseUrl: `https://${host}/${owner}/${repo}`,
      };
    }
  } catch {
    // Invalid URL format
  }

  return null;
}

export function getCommitUrl(
  remoteUrl: string,
  commitOid: string,
): string | null {
  const forge = parseRemoteUrl(remoteUrl);
  if (!forge) return null;

  switch (forge.provider) {
    case "github":
      return `${forge.webBaseUrl}/commit/${commitOid}`;
    case "gitlab":
      return `${forge.webBaseUrl}/-/commit/${commitOid}`;
    case "bitbucket":
      return `${forge.webBaseUrl}/commits/${commitOid}`;
    default:
      return `${forge.webBaseUrl}/commit/${commitOid}`;
  }
}

export function getBranchUrl(
  remoteUrl: string,
  branchName: string,
): string | null {
  const forge = parseRemoteUrl(remoteUrl);
  if (!forge) return null;

  switch (forge.provider) {
    case "github":
      return `${forge.webBaseUrl}/tree/${encodeURIComponent(branchName)}`;
    case "gitlab":
      return `${forge.webBaseUrl}/-/tree/${encodeURIComponent(branchName)}`;
    case "bitbucket":
      return `${forge.webBaseUrl}/src/${encodeURIComponent(branchName)}`;
    default:
      return `${forge.webBaseUrl}/tree/${encodeURIComponent(branchName)}`;
  }
}

export function getFileBlameUrl(
  remoteUrl: string,
  refOrBranch: string,
  filePath: string,
  line?: number,
): string | null {
  const forge = parseRemoteUrl(remoteUrl);
  if (!forge) return null;

  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const lineHash = line ? `#L${line}` : "";

  switch (forge.provider) {
    case "github":
      return `${forge.webBaseUrl}/blame/${refOrBranch}/${encodedPath}${lineHash}`;
    case "gitlab":
      return `${forge.webBaseUrl}/-/blame/${refOrBranch}/${encodedPath}${lineHash}`;
    case "bitbucket":
      return `${forge.webBaseUrl}/annotate/${refOrBranch}/${encodedPath}${lineHash}`;
    default:
      return `${forge.webBaseUrl}/blame/${refOrBranch}/${encodedPath}${lineHash}`;
  }
}

export function getCreatePrUrl(
  remoteUrl: string,
  sourceBranch: string,
  targetBranch = "main",
): string | null {
  const forge = parseRemoteUrl(remoteUrl);
  if (!forge) return null;

  switch (forge.provider) {
    case "github":
      return `${forge.webBaseUrl}/compare/${encodeURIComponent(targetBranch)}...${encodeURIComponent(sourceBranch)}?expand=1`;
    case "gitlab":
      return `${forge.webBaseUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(sourceBranch)}&merge_request[target_branch]=${encodeURIComponent(targetBranch)}`;
    case "bitbucket":
      return `${forge.webBaseUrl}/pull-requests/new?source=${encodeURIComponent(sourceBranch)}`;
    default:
      return `${forge.webBaseUrl}/compare/${encodeURIComponent(sourceBranch)}`;
  }
}

export interface CiStatusResult {
  status: "success" | "failure" | "running" | "unknown";
  workflowName?: string;
  url?: string;
}

export async function fetchGitHubCiStatus(
  remoteUrl: string,
  branch = "main",
): Promise<CiStatusResult> {
  const forge = parseRemoteUrl(remoteUrl);
  if (forge?.provider !== "github") {
    return { status: "unknown" };
  }

  try {
    const apiUrl = `https://api.github.com/repos/${forge.owner}/${forge.repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`;
    const resp = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Basilico-Git-Client",
      },
    });

    if (!resp.ok) return { status: "unknown" };

    const data = await resp.json();
    const latestRun = data.workflow_runs?.[0];

    if (!latestRun) return { status: "unknown" };

    let status: CiStatusResult["status"] = "unknown";
    if (latestRun.status === "in_progress" || latestRun.status === "queued") {
      status = "running";
    } else if (latestRun.conclusion === "success") {
      status = "success";
    } else if (
      latestRun.conclusion === "failure" ||
      latestRun.conclusion === "timed_out"
    ) {
      status = "failure";
    }

    return {
      status,
      workflowName: latestRun.name,
      url: latestRun.html_url,
    };
  } catch {
    return { status: "unknown" };
  }
}
