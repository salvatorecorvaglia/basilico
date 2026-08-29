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
  /** The remote's hostname, so callers can distinguish github.com from a
   *  self-hosted forge that merely resembles one. */
  host: string;
}

/**
 * Classify a remote host.
 *
 * Everything that is not recognisably GitLab or Bitbucket used to be labelled
 * "github", which meant a self-hosted GitLab (`git.company.com`), a Gitea
 * instance, or any other forge was handed GitHub's URL shapes — and, worse,
 * was treated as a GitHub repository by `fetchGitHubCiStatus`, which then
 * queried api.github.com for an unrelated `owner/repo` with the user's token
 * attached. Only github.com is GitHub; anything unrecognised is "generic",
 * whose URL shapes (`/commit/<sha>`, `/tree/<ref>`) match the widely-used
 * GitHub-compatible layout Gitea and Forgejo also serve.
 */
function detectProvider(host: string): ForgeProvider {
  const lower = host.toLowerCase();
  if (lower === "github.com" || lower.endsWith(".github.com")) return "github";
  if (lower.includes("gitlab")) return "gitlab";
  if (lower.includes("bitbucket")) return "bitbucket";
  return "generic";
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
        return {
          provider: detectProvider(host),
          owner,
          repo,
          webBaseUrl: `https://${host}/${owner}/${repo}`,
          host,
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
      return {
        provider: detectProvider(host),
        owner,
        repo,
        webBaseUrl: `https://${host}/${owner}/${repo}`,
        host,
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
  githubPat?: string | null,
): Promise<CiStatusResult> {
  const forge = parseRemoteUrl(remoteUrl);
  // Only github.com is served by api.github.com. Anything else — a self-hosted
  // GitLab, a Gitea instance, an enterprise host — would otherwise have its
  // owner/repo pasted into a github.com API path and queried with the user's
  // personal access token, reporting a stranger's CI status as this repo's.
  if (
    forge?.provider !== "github" ||
    forge.host.toLowerCase() !== "github.com"
  ) {
    return { status: "unknown" };
  }

  try {
    // Encoded per path segment: `repo` can still contain a slash when the
    // remote URL has extra path components, and an unencoded one would
    // silently address a different API endpoint.
    const owner = encodeURIComponent(forge.owner);
    const repo = encodeURIComponent(forge.repo);
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "Basilico-Git-Client",
    };
    if (githubPat) {
      headers.Authorization = `Bearer ${githubPat}`;
    }
    const resp = await fetch(apiUrl, { headers });

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
