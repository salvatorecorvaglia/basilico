/* ═══════════════════════════════════════════════════════
   Basilico — StatusBar Component
   Bottom status bar with repo info
   ═══════════════════════════════════════════════════════ */

import { getVersion } from "@tauri-apps/api/app";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  GitBranch,
  PlayCircle,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  type CiStatusResult,
  fetchGitHubCiStatus,
} from "../../lib/forge-links";
import { describeRepoState } from "../../lib/repo-state";
import { getGithubPat } from "../../lib/tauri-commands";
import { openExternalUrl } from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { selectDefaultRemoteUrl } from "../../store/slices/git-data-slice";
import { useUIStore } from "../../store/ui-store";
import { GitDoctorModal } from "../settings/GitDoctorModal";
import "./StatusBar.css";

export function StatusBar() {
  const { status, repoInfo, isRefreshing, settings } = useRepoStore(
    useShallow((s) => ({
      status: s.status,
      repoInfo: s.repoInfo,
      isRefreshing: s.isRefreshing,
      settings: s.settings,
    })),
  );
  // `remotes[0]` is libgit2's ordering, not a meaningful choice — on a fork
  // with both `origin` and `upstream` it picked whichever came first and
  // reported the wrong repository's CI.
  const defaultRemoteUrl = useRepoStore(selectDefaultRemoteUrl);

  const { setActiveView } = useUIStore(
    useShallow((s) => ({ setActiveView: s.setActiveView })),
  );
  const [version, setVersion] = useState("");
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [ciStatus, setCiStatus] = useState<CiStatusResult>({
    status: "unknown",
  });

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch((err) => {
        console.error("Failed to get app version:", err);
        setVersion("1.3.0"); // Fallback
      });
  }, []);

  useEffect(() => {
    const remoteUrl = defaultRemoteUrl;
    const branch = status?.branch || "main";

    if (!settings?.checkGithubCiStatus || !remoteUrl) {
      setCiStatus({ status: "unknown" });
      return;
    }

    // Guard against a slow response for a previous branch/remote landing
    // after a newer request already started — without this, switching
    // branches quickly could display a stale CI badge for the wrong branch.
    let cancelled = false;
    // The token is kept in the system keychain and fetched only for this
    // opt-in request; without one the check runs unauthenticated.
    const token = settings.hasGithubPat
      ? getGithubPat({ silent: true }).catch(() => null)
      : Promise.resolve(null);
    token
      .then((pat) => fetchGitHubCiStatus(remoteUrl, branch, pat))
      .then((result) => {
        if (!cancelled) setCiStatus(result);
      });
    return () => {
      cancelled = true;
    };
  }, [
    defaultRemoteUrl,
    status?.branch,
    settings?.checkGithubCiStatus,
    settings?.hasGithubPat,
  ]);

  const totalChanges =
    (status?.staged.length || 0) +
    (status?.unstaged.length || 0) +
    (status?.untracked.length || 0);

  return (
    <>
      <div className="statusbar">
        <div className="statusbar-section statusbar-left">
          {repoInfo && (
            <>
              <span className="statusbar-item statusbar-branch">
                <GitBranch size={12} />
                {status?.branch || "detached"}
              </span>

              {status && (status.ahead > 0 || status.behind > 0) && (
                <span className="statusbar-item statusbar-sync">
                  {status.ahead > 0 && (
                    <span className="statusbar-ahead">↑{status.ahead}</span>
                  )}
                  {status.behind > 0 && (
                    <span className="statusbar-behind">↓{status.behind}</span>
                  )}
                </span>
              )}

              {ciStatus.status !== "unknown" && (
                <button
                  type="button"
                  className={`statusbar-item statusbar-btn statusbar-ci statusbar-ci--${ciStatus.status}${ciStatus.url ? "" : " no-link"}`}
                  onClick={() => ciStatus.url && openExternalUrl(ciStatus.url)}
                  title={`CI Workflow: ${ciStatus.workflowName || ciStatus.status}`}
                >
                  {ciStatus.status === "success" && <CheckCircle2 size={12} />}
                  {ciStatus.status === "failure" && <XCircle size={12} />}
                  {ciStatus.status === "running" && (
                    <PlayCircle size={12} className="animate-spin" />
                  )}
                  <span>CI: {ciStatus.status}</span>
                </button>
              )}

              {totalChanges > 0 && (
                <button
                  type="button"
                  className="statusbar-item statusbar-changes statusbar-btn"
                  onClick={() => setActiveView("staging")}
                  title="View changes in Staging Area"
                >
                  <AlertCircle size={12} />
                  {totalChanges} change{totalChanges !== 1 ? "s" : ""}
                </button>
              )}
            </>
          )}
        </div>

        <div className="statusbar-section statusbar-right">
          {repoInfo && (
            <button
              type="button"
              className="statusbar-item statusbar-btn"
              onClick={() => setDoctorOpen(true)}
              title="Open Git Doctor & Storage Diagnostics"
            >
              <Activity size={12} />
              <span>Git Doctor</span>
            </button>
          )}

          {isRefreshing && (
            <span className="statusbar-item statusbar-refreshing">
              <Clock size={12} className="animate-spin" />
              Refreshing…
            </span>
          )}

          {describeRepoState(status?.state) && (
            <span
              className="statusbar-item statusbar-state"
              title={status?.state}
            >
              {describeRepoState(status?.state)}
            </span>
          )}

          <span className="statusbar-item statusbar-version">
            <img src="/basilico-logo-icon-transparent.svg" alt="" width={16} height={16} />
            Basilico v{version || "1.3.0"}
          </span>
        </div>
      </div>

      <GitDoctorModal open={doctorOpen} onOpenChange={setDoctorOpen} />
    </>
  );
}
