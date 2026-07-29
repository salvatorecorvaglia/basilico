/* ═══════════════════════════════════════════════════════
   Basilico — StatusBar Component
   Bottom status bar with repo info
   ═══════════════════════════════════════════════════════ */

import { getVersion } from "@tauri-apps/api/app";
import { Activity, AlertCircle, Clock, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import { GitDoctorModal } from "../settings/GitDoctorModal";
import "./StatusBar.css";

export function StatusBar() {
  const { status, repoInfo, isRefreshing } = useRepoStore();
  const { setActiveView } = useUIStore();
  const [version, setVersion] = useState("");
  const [doctorOpen, setDoctorOpen] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch((err) => {
        console.error("Failed to get app version:", err);
        setVersion("0.12.1"); // Fallback
      });
  }, []);

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
            Basilico v{version || "0.12.1"}
          </span>
        </div>
      </div>

      <GitDoctorModal open={doctorOpen} onOpenChange={setDoctorOpen} />
    </>
  );
}
