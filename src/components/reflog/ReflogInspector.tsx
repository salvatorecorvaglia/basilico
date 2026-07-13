/* ═══════════════════════════════════════════════════════
   Basilico — Reflog Inspector Component
   Browse HEAD reflog, search, filter, and reset branch to target state
   ═══════════════════════════════════════════════════════ */

import {
  Clock,
  Copy,
  ExternalLink,
  GitBranch,
  RefreshCw,
  RotateCcw,
  Search,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateTime } from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ReflogInspector.css";

function getActionColor(action: string): string {
  const norm = action.toLowerCase();
  if (norm.includes("commit") || norm.includes("amend"))
    return "var(--accent-green)";
  if (norm.includes("checkout")) return "var(--accent-blue)";
  if (norm.includes("reset")) return "var(--accent-red)";
  if (norm.includes("rebase")) return "var(--accent-purple)";
  if (norm.includes("merge")) return "var(--accent-pink)";
  if (norm.includes("pull") || norm.includes("fetch"))
    return "var(--accent-teal)";
  if (norm.includes("cherry-pick")) return "var(--accent-gold)";
  return "var(--text-tertiary)";
}

export function ReflogInspector() {
  const { activeTabId, reflogEntries, loadReflog, selectCommit } =
    useRepoStore();
  const { openResetModal, setActiveView, addNotification } = useUIStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (activeTabId) {
      loadReflog().then(() => {
        setSelectedIdx(0);
      });
    }
  }, [activeTabId, loadReflog]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadReflog();
      addNotification({
        type: "success",
        message: "Reflog reloaded successfully",
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to reload reflog: ${err}`,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification({
      type: "success",
      message: "Copied commit hash to clipboard",
    });
  };

  const handleViewCommit = async (oid: string) => {
    await selectCommit(oid);
    setActiveView("graph");
  };

  // Filter entries
  const filteredEntries = reflogEntries.filter((entry) => {
    const query = searchQuery.toLowerCase();
    return (
      entry.message.toLowerCase().includes(query) ||
      entry.newOid.toLowerCase().includes(query) ||
      entry.committerName.toLowerCase().includes(query)
    );
  });

  const selectedEntry =
    selectedIdx !== null
      ? filteredEntries.find((_, i) => i === selectedIdx) || filteredEntries[0]
      : null;

  return (
    <div className="reflog-container">
      {/* Sidebar - Entry List */}
      <div className="reflog-sidebar">
        <div className="reflog-sidebar-header">
          <div className="reflog-search-bar">
            <Search size={12} className="reflog-search-icon" />
            <input
              type="text"
              placeholder="Search reflog..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIdx(0);
              }}
              className="reflog-search-input"
            />
          </div>
          <button
            type="button"
            className={`reflog-refresh-btn ${isRefreshing ? "spinning" : ""}`}
            onClick={handleRefresh}
            title="Reload Reflog"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="reflog-list custom-scrollbar">
          {filteredEntries.length === 0 ? (
            <div className="reflog-empty-state">No reflog entries found</div>
          ) : (
            filteredEntries.map((entry, idx) => {
              // Parse action prefix
              const parts = entry.message.split(": ");
              const action = parts.length > 1 ? parts[0] : "action";
              const detail =
                parts.length > 1 ? parts.slice(1).join(": ") : entry.message;
              const isSelected =
                selectedEntry && selectedEntry.index === entry.index;

              return (
                <button
                  key={`${entry.index}-${entry.newOid}`}
                  type="button"
                  className={`reflog-item ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedIdx(idx)}
                >
                  <div className="reflog-item-header">
                    <span
                      className="reflog-action-badge"
                      style={{
                        backgroundColor: `${getActionColor(action)}15`,
                        color: getActionColor(action),
                        borderColor: `${getActionColor(action)}30`,
                      }}
                    >
                      {action}
                    </span>
                    <span className="reflog-item-ref">
                      HEAD@&#123;{entry.index}&#125;
                    </span>
                  </div>
                  <div className="reflog-item-message truncate">{detail}</div>
                  <div className="reflog-item-meta">
                    <span className="reflog-item-oid">
                      {entry.newOid.substring(0, 7)}
                    </span>
                    <span className="reflog-item-dot">•</span>
                    <span className="reflog-item-date">
                      {formatDateTime(entry.committerDate)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Details Panel */}
      <div className="reflog-details-panel">
        {selectedEntry ? (
          <div className="reflog-details-content animate-fade-in">
            {/* Header / Summary */}
            <div className="reflog-details-header">
              <div className="reflog-details-badge-group">
                <span className="reflog-head-tag">
                  HEAD@&#123;{selectedEntry.index}&#125;
                </span>
                {(() => {
                  const parts = selectedEntry.message.split(": ");
                  const action = parts.length > 1 ? parts[0] : "action";
                  return (
                    <span
                      className="reflog-action-badge"
                      style={{
                        backgroundColor: `${getActionColor(action)}15`,
                        color: getActionColor(action),
                        borderColor: `${getActionColor(action)}30`,
                      }}
                    >
                      {action}
                    </span>
                  );
                })()}
              </div>
              <h2 className="reflog-details-title">
                {(() => {
                  const parts = selectedEntry.message.split(": ");
                  return parts.length > 1
                    ? parts.slice(1).join(": ")
                    : selectedEntry.message;
                })()}
              </h2>
            </div>

            {/* Committer Info */}
            <div className="reflog-meta-card">
              <div className="reflog-meta-row">
                <User size={13} className="reflog-meta-icon" />
                <span className="reflog-meta-label">Committer:</span>
                <span className="reflog-meta-value">
                  {selectedEntry.committerName}{" "}
                  {selectedEntry.committerEmail && (
                    <span className="reflog-meta-email">
                      &lt;{selectedEntry.committerEmail}&gt;
                    </span>
                  )}
                </span>
              </div>
              <div className="reflog-meta-row">
                <Clock size={13} className="reflog-meta-icon" />
                <span className="reflog-meta-label">Timestamp:</span>
                <span className="reflog-meta-value">
                  {formatDateTime(selectedEntry.committerDate)}
                </span>
              </div>
            </div>

            {/* State Transition (Old -> New) */}
            <div className="reflog-transition-container">
              <h3 className="reflog-section-title">State Transition</h3>
              <div className="reflog-transition-row">
                <div className="reflog-transition-node">
                  <div className="reflog-node-title">Previous Target (Old)</div>
                  <div className="reflog-node-oid mono">
                    {selectedEntry.oldOid}
                  </div>
                  <button
                    type="button"
                    className="reflog-node-action"
                    onClick={() => copyToClipboard(selectedEntry.oldOid)}
                    title="Copy hash"
                  >
                    <Copy size={11} /> Copy Hash
                  </button>
                </div>

                <div className="reflog-transition-arrow">
                  <div className="reflog-arrow-line" />
                  <div className="reflog-arrow-head" />
                </div>

                <div className="reflog-transition-node highlight">
                  <div className="reflog-node-title">
                    Destination State (New)
                  </div>
                  <div className="reflog-node-oid mono">
                    {selectedEntry.newOid}
                  </div>
                  <button
                    type="button"
                    className="reflog-node-action"
                    onClick={() => copyToClipboard(selectedEntry.newOid)}
                    title="Copy hash"
                  >
                    <Copy size={11} /> Copy Hash
                  </button>
                </div>
              </div>
            </div>

            {/* Actions Panel */}
            <div className="reflog-actions-container">
              <h3 className="reflog-section-title">Emergency Actions</h3>
              <div className="reflog-actions-list">
                <button
                  type="button"
                  className="reflog-action-btn primary-danger"
                  onClick={() => openResetModal(selectedEntry.newOid)}
                >
                  <RotateCcw size={14} />
                  <div>
                    <span className="btn-title">
                      Reset Branch to this State
                    </span>
                    <span className="btn-desc">
                      Resets your active branch's HEAD to this specific snapshot
                      (supports soft, mixed, or hard).
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="reflog-action-btn secondary"
                  onClick={() => handleViewCommit(selectedEntry.newOid)}
                >
                  <ExternalLink size={14} />
                  <div>
                    <span className="btn-title">View Commit in History</span>
                    <span className="btn-desc">
                      Switches back to the Commit Graph and displays details for
                      this commit.
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="reflog-details-empty">
            <GitBranch size={32} className="reflog-empty-icon" />
            <h3 className="reflog-empty-title">No Entry Selected</h3>
            <p className="reflog-empty-subtitle">
              Select a reflog entry from the list to inspect state details and
              run recovery operations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
