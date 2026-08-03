/* ═══════════════════════════════════════════════════════
   Basilico — Reflog Inspector Component
   Inspection and state restoration via git reflog
   ═══════════════════════════════════════════════════════ */

import {
  Check,
  Clock,
  Copy,
  History,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReflogEntry } from "../../lib/git-types";
import { getReflog, restoreReflogEntry } from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ReflogInspector.css";

function getActionBadgeClass(message: string): { label: string; className: string } {
  const lower = message.toLowerCase();
  if (lower.startsWith("checkout:")) return { label: "checkout", className: "action-checkout" };
  if (lower.startsWith("commit:") || lower.startsWith("commit (amend):"))
    return { label: "commit", className: "action-commit" };
  if (lower.startsWith("rebase")) return { label: "rebase", className: "action-rebase" };
  if (lower.startsWith("reset:")) return { label: "reset", className: "action-reset" };
  if (lower.startsWith("merge")) return { label: "merge", className: "action-merge" };
  if (lower.startsWith("pull:") || lower.startsWith("fetch:"))
    return { label: "pull", className: "action-pull" };
  if (lower.startsWith("cherry-pick"))
    return { label: "cherry-pick", className: "action-cherry-pick" };

  const firstWord = message.split(":")[0]?.trim() || "action";
  return { label: firstWord.slice(0, 14), className: "action-default" };
}

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

export function ReflogInspector() {
  const { addNotification } = useUIStore();
  const { activeTabId, refreshAll } = useRepoStore();

  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refTarget, setRefTarget] = useState("HEAD");
  const [maxCount, setMaxCount] = useState(200);
  const [copiedOid, setCopiedOid] = useState<string | null>(null);

  // Restore Modal State
  const [restoreModalEntry, setRestoreModalEntry] = useState<ReflogEntry | null>(null);
  const [resetMode, setResetMode] = useState<"mixed" | "soft" | "hard">("mixed");
  const [isRestoring, setIsRestoring] = useState(false);

  const fetchReflogEntries = useCallback(async () => {
    if (!activeTabId) return;
    setIsLoading(true);
    try {
      const data = await getReflog(activeTabId, refTarget, maxCount);
      setEntries(data || []);
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to load reflog: ${err}`,
      });
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTabId, refTarget, maxCount, addNotification]);

  useEffect(() => {
    fetchReflogEntries();
  }, [fetchReflogEntries]);

  const handleCopyOid = (oid: string) => {
    navigator.clipboard.writeText(oid);
    setCopiedOid(oid);
    addNotification({ type: "info", message: `Copied commit SHA ${oid.slice(0, 7)} to clipboard` });
    setTimeout(() => setCopiedOid(null), 2000);
  };

  const handleConfirmRestore = async () => {
    if (!activeTabId || !restoreModalEntry) return;
    setIsRestoring(true);
    try {
      await restoreReflogEntry(activeTabId, restoreModalEntry.newOid, resetMode);
      addNotification({
        type: "success",
        message: `Successfully reset HEAD (${resetMode}) to ${restoreModalEntry.newOid.slice(0, 7)}`,
      });
      setRestoreModalEntry(null);
      await refreshAll();
      await fetchReflogEntries();
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to restore reflog entry: ${err}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter(
      (entry) =>
        entry.message.toLowerCase().includes(query) ||
        entry.newOid.toLowerCase().includes(query) ||
        entry.committerName.toLowerCase().includes(query) ||
        `head@{${entry.index}}`.includes(query),
    );
  }, [entries, searchQuery]);

  return (
    <div className="reflog-container">
      {/* Header Bar */}
      <div className="reflog-header">
        <div className="reflog-title-section">
          <div className="reflog-title-icon">
            <History size={16} />
          </div>
          <div>
            <h2 className="reflog-title">
              Reflog Inspector
              <span className="reflog-count-badge">
                {filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"}
              </span>
            </h2>
            <p className="reflog-subtitle">
              Audit trail and state restoration for reference updates
            </p>
          </div>
        </div>

        <div className="reflog-controls">
          {/* Search Input */}
          <div className="reflog-search-wrapper">
            <Search size={13} className="reflog-search-icon" />
            <input
              type="text"
              className="reflog-search-input"
              placeholder="Search action, OID, or message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Ref Target Selector */}
          <select
            className="reflog-select"
            value={refTarget}
            onChange={(e) => setRefTarget(e.target.value)}
            title="Git Reference"
          >
            <option value="HEAD">Ref: HEAD</option>
            <option value="refs/heads/main">Ref: main</option>
            <option value="refs/heads/master">Ref: master</option>
            <option value="refs/heads/develop">Ref: develop</option>
          </select>

          {/* Limit Count Selector */}
          <select
            className="reflog-select"
            value={maxCount}
            onChange={(e) => setMaxCount(Number(e.target.value))}
            title="Max Entries"
          >
            <option value={50}>50 limit</option>
            <option value={100}>100 limit</option>
            <option value={200}>200 limit</option>
            <option value={500}>500 limit</option>
          </select>

          {/* Refresh Button */}
          <button
            type="button"
            className={`reflog-btn ${isLoading ? "spinning" : ""}`}
            onClick={fetchReflogEntries}
            disabled={isLoading}
            title="Refresh Reflog"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Table / List */}
      <div className="reflog-content custom-scrollbar">
        {isLoading && entries.length === 0 ? (
          <div className="reflog-loading-state">
            <RefreshCw size={24} className="spinning" />
            <p>Loading git reflog entries...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="reflog-empty-state">
            <Clock size={32} className="reflog-empty-icon" />
            <p>
              {searchQuery
                ? `No reflog entries matching "${searchQuery}"`
                : `No reflog history available for reference "${refTarget}"`}
            </p>
          </div>
        ) : (
          <table className="reflog-table">
            <thead>
              <tr>
                <th className="col-index">Ref Selector</th>
                <th className="col-action">Action</th>
                <th className="col-sha">Commit SHA</th>
                <th className="col-message">Description / Operation</th>
                <th className="col-author">Committer</th>
                <th className="col-date">Date</th>
                <th className="col-actions">Restore</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const actionBadge = getActionBadgeClass(entry.message);
                const isCopied = copiedOid === entry.newOid;

                return (
                  <tr key={`${entry.index}-${entry.newOid}`} className="reflog-row">
                    {/* Index */}
                    <td className="col-index">{refTarget}@{`{${entry.index}}`}</td>

                    {/* Action Badge */}
                    <td className="col-action">
                      <span className={`reflog-action-badge ${actionBadge.className}`}>
                        {actionBadge.label}
                      </span>
                    </td>

                    {/* Commit OID */}
                    <td className="col-sha">
                      <button
                        type="button"
                        className="reflog-sha-btn"
                        onClick={() => handleCopyOid(entry.newOid)}
                        title="Click to copy commit OID"
                      >
                        {isCopied ? <Check size={11} /> : <Copy size={11} />}
                        <span>{entry.newOid.slice(0, 7)}</span>
                      </button>
                    </td>

                    {/* Message */}
                    <td className="col-message">{entry.message}</td>

                    {/* Author */}
                    <td className="col-author" title={entry.committerEmail}>
                      {entry.committerName || "Unknown"}
                    </td>

                    {/* Relative Date */}
                    <td className="col-date">{formatRelativeTime(entry.date)}</td>

                    {/* Restore Action */}
                    <td className="col-actions">
                      <button
                        type="button"
                        className="reflog-row-btn"
                        onClick={() => setRestoreModalEntry(entry)}
                        title={`Reset HEAD to ${entry.newOid.slice(0, 7)}`}
                      >
                        <RotateCcw size={11} />
                        <span>Restore</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {restoreModalEntry && (
        <div className="reflog-modal-overlay">
          <div className="reflog-modal">
            <div className="reflog-modal-header">
              <h3 className="reflog-modal-title">
                <RotateCcw size={16} style={{ color: "#ef4444" }} />
                Restore Repository State
              </h3>
              <button
                type="button"
                className="reflog-modal-close"
                onClick={() => setRestoreModalEntry(null)}
                disabled={isRestoring}
              >
                <X size={16} />
              </button>
            </div>

            <div className="reflog-modal-body">
              <div className="reflog-entry-preview">
                <div className="reflog-preview-label">
                  Target Ref Entry ({refTarget}@{`{${restoreModalEntry.index}}`} - {restoreModalEntry.newOid.slice(0, 7)})
                </div>
                <div className="reflog-preview-msg">{restoreModalEntry.message}</div>
              </div>

              <div className="reflog-mode-options">
                {/* Mixed Mode (Recommended) */}
                <div
                  className={`reflog-mode-card ${resetMode === "mixed" ? "selected" : ""}`}
                  onClick={() => setResetMode("mixed")}
                >
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === "mixed"}
                    onChange={() => setResetMode("mixed")}
                    className="reflog-mode-radio"
                  />
                  <div className="reflog-mode-info">
                    <span className="reflog-mode-name">Mixed Reset (Recommended)</span>
                    <span className="reflog-mode-desc">
                      Resets HEAD and staging index. Keeps all your working directory files unchanged.
                    </span>
                  </div>
                </div>

                {/* Soft Mode */}
                <div
                  className={`reflog-mode-card ${resetMode === "soft" ? "selected" : ""}`}
                  onClick={() => setResetMode("soft")}
                >
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === "soft"}
                    onChange={() => setResetMode("soft")}
                    className="reflog-mode-radio"
                  />
                  <div className="reflog-mode-info">
                    <span className="reflog-mode-name">Soft Reset</span>
                    <span className="reflog-mode-desc">
                      Resets HEAD only. Keeps all uncommitted changes staged in the index.
                    </span>
                  </div>
                </div>

                {/* Hard Mode */}
                <div
                  className={`reflog-mode-card ${resetMode === "hard" ? "selected" : ""}`}
                  onClick={() => setResetMode("hard")}
                >
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === "hard"}
                    onChange={() => setResetMode("hard")}
                    className="reflog-mode-radio"
                  />
                  <div className="reflog-mode-info">
                    <span className="reflog-mode-name" style={{ color: "#ef4444" }}>
                      Hard Reset (Warning: Destructive)
                    </span>
                    <span className="reflog-mode-desc">
                      Discards all uncommitted changes in your working directory to match the target commit exactly.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="reflog-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRestoreModalEntry(null)}
                disabled={isRestoring}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
              >
                {isRestoring ? "Restoring..." : `Reset HEAD to ${restoreModalEntry.newOid.slice(0, 7)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
