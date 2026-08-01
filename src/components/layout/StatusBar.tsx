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
import {
  type CiStatusResult,
  fetchGitHubCiStatus,
} from "../../lib/forge-links";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import { GitDoctorModal } from "../settings/GitDoctorModal";
import "./StatusBar.css";

export function StatusBar() {
  const { status, repoInfo, remotes, isRefreshing } = useRepoStore();
  const { setActiveView } = useUIStore();
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
        setVersion("1.0.0"); // Fallback
      });
  }, []);

  useEffect(() => {
    const remoteUrl = remotes[0]?.url;
    const branch = status?.branch || "main";

    if (!remoteUrl) {
      setCiStatus({ status: "unknown" });
      return;
    }

    fetchGitHubCiStatus(remoteUrl, branch).then(setCiStatus);
  }, [remotes, status?.branch]);

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
                  className="statusbar-item statusbar-btn"
                  onClick={() =>
                    ciStatus.url && window.open(ciStatus.url, "_blank")
                  }
                  title={`CI Workflow: ${ciStatus.workflowName || ciStatus.status}`}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: ciStatus.url ? "pointer" : "default",
                    color:
                      ciStatus.status === "success"
                        ? "var(--accent-primary, #2da44e)"
                        : ciStatus.status === "failure"
                          ? "var(--danger-color, #f85149)"
                          : "var(--accent-info, #0969da)",
                  }}
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
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
              }}
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

          {status?.state && status.state !== "Clean" && (
            <span className="statusbar-item statusbar-state">
              {status.state}
            </span>
          )}

          <span className="statusbar-item statusbar-version">
            Basilico v{version || "1.0.0"}
          </span>
        </div>
      </div>

      <GitDoctorModal open={doctorOpen} onOpenChange={setDoctorOpen} />
    </>
  );
}
