/* ═══════════════════════════════════════════════════════
   Basilico — Reflog Inspector Component
   Inspection and state restoration via git reflog
   ═══════════════════════════════════════════════════════ */

import * as Dialog from "@radix-ui/react-dialog";
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
import { useShallow } from "zustand/react/shallow";
import type { ReflogEntry } from "../../lib/git-types";
import { getReflog, restoreReflogEntry } from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ReflogInspector.css";
import { useCopyFeedback } from "../../lib/use-copy-feedback";

/**
 * Maps a reflog verb to the badge class that colours it.
 *
 * Keyed on the leading *word* rather than a `"<verb>:"` prefix. Git only writes
 * the bare `pull:` form when the command had no arguments — with arguments it
 * writes `pull --tags origin develop: Fast-forward`, which matched none of the
 * prefixes and fell through to the generic branch below. That sliced the whole
 * argument string to 14 characters and uppercased it, so every such row read
 * `PULL -- TAGS OR` and wrapped onto two lines in a 110px column.
 */
const ACTION_CLASSES: Record<string, string> = {
  checkout: "action-checkout",
  clone: "action-checkout",
  commit: "action-commit",
  am: "action-commit",
  rebase: "action-rebase",
  reset: "action-reset",
  revert: "action-reset",
  merge: "action-merge",
  pull: "action-pull",
  fetch: "action-pull",
  push: "action-pull",
  "cherry-pick": "action-cherry-pick",
  stash: "action-default",
};

function getActionBadgeClass(message: string): {
  label: string;
  className: string;
} {
  // Everything before the first colon is the command and its arguments;
  // the first whitespace-delimited token of that is the verb. `commit
  // (amend)` and `rebase -i (start)` both reduce to their leading word.
  const head = message.split(":")[0]?.trim().toLowerCase() ?? "";
  const verb = head.split(/\s+/)[0] ?? "";

  const className = ACTION_CLASSES[verb];
  if (className) return { label: verb, className };

  // Unknown verb: show the bare word, never the argument string. The badge
  // also ellipsises in CSS so no label can wrap the row.
  return {
    label: (verb || "action").slice(0, 10),
    className: "action-default",
  };
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
  const { addNotification } = useUIStore(
    useShallow((s) => ({ addNotification: s.addNotification })),
  );
  const { activeTabId, refreshAll, branches } = useRepoStore(
    useShallow((s) => ({
      activeTabId: s.activeTabId,
      refreshAll: s.refreshAll,
      branches: s.branches,
    })),
  );

  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refTarget, setRefTarget] = useState("HEAD");
  const [maxCount, setMaxCount] = useState(200);
  // Keyed by OID so the tick shows on the row that was actually copied.
  const { copiedKey: copiedOid, markCopied } = useCopyFeedback();

  // Restore Modal State
  const [restoreModalEntry, setRestoreModalEntry] =
    useState<ReflogEntry | null>(null);
  const [resetMode, setResetMode] = useState<"mixed" | "soft" | "hard">(
    "mixed",
  );
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
    markCopied(oid);
    addNotification({
      type: "info",
      message: `Copied commit SHA ${oid.slice(0, 7)} to clipboard`,
    });
  };

  const handleConfirmRestore = async () => {
    if (!activeTabId || !restoreModalEntry) return;
    setIsRestoring(true);
    try {
      await restoreReflogEntry(
        activeTabId,
        restoreModalEntry.newOid,
        resetMode,
      );
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

  /**
   * The selectable refs. This list used to be hardcoded to HEAD/main/master/
   * develop, so a repository could be offered a `master` it does not have while
   * its actual branches were unreachable. Local branches only: a reflog is a
   * property of a local ref, and remote-tracking refs rarely carry one.
   */
  const refOptions = useMemo(() => {
    const locals = branches
      .filter((b) => !b.isRemote)
      .map((b) => `refs/heads/${b.name}`)
      .sort();
    return ["HEAD", ...locals];
  }, [branches]);

  /**
   * If the selected branch disappears (checkout of another repo, branch
   * deleted), fall back to HEAD rather than querying a ref that is gone.
   */
  useEffect(() => {
    if (refTarget !== "HEAD" && !refOptions.includes(refTarget)) {
      setRefTarget("HEAD");
    }
  }, [refOptions, refTarget]);

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
      {/*
        Header. Uses the shared `.view-header` so this view lines up with Blame
        and File History; it used to carry its own taller title block with a
        gradient icon badge and a subtitle, which made the Reflog screen read
        like a different application. The subtitle survives as the heading's
        tooltip rather than a second line of chrome.
      */}
      <div className="view-header">
        <div className="reflog-title-section">
          <History size={15} className="text-tertiary" />
          <h2
            className="reflog-title"
            title="Audit trail and state restoration for reference updates"
          >
            Reflog Inspector
          </h2>
          <span className="reflog-count-badge">
            {filteredEntries.length}{" "}
            {filteredEntries.length === 1 ? "entry" : "entries"}
          </span>
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
            aria-label="Git reference to inspect"
          >
            {refOptions.map((ref) => (
              <option key={ref} value={ref}>
                Ref: {ref.replace("refs/heads/", "")}
              </option>
            ))}
          </select>

          {/* Limit Count Selector */}
          <select
            className="reflog-select"
            value={maxCount}
            onChange={(e) => setMaxCount(Number(e.target.value))}
            title="Max Entries"
            aria-label="Maximum reflog entries to load"
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
          <div className="empty-state reflog-loading-state">
            <RefreshCw size={24} className="spinning" />
            <p>Loading git reflog entries...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="empty-state reflog-empty-state">
            <Clock size={32} className="empty-state-icon reflog-empty-icon" />
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
                  <tr
                    key={`${entry.index}-${entry.newOid}`}
                    className="reflog-row"
                  >
                    {/* Index */}
                    <td className="col-index">
                      {refTarget}@{`{${entry.index}}`}
                    </td>

                    {/* Action Badge */}
                    <td className="col-action">
                      <span
                        className={`reflog-action-badge ${actionBadge.className}`}
                      >
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
                    <td className="col-date">
                      {formatRelativeTime(entry.date)}
                    </td>

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

      {/*
        Restore Confirmation Modal.

        A Radix Dialog like every other modal in the app. It was previously a
        bare <div> overlay — the only one that was — which left the most
        destructive action here (a hard reset) as the only dialog with no focus
        trap, no Escape, no backdrop dismiss and no dialog role.
      */}
      <Dialog.Root
        open={!!restoreModalEntry}
        onOpenChange={(open) => {
          // A restore in flight must not be dismissable by Escape or backdrop
          // either — the close button is already disabled while it runs.
          if (!open && !isRestoring) setRestoreModalEntry(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="reflog-modal-overlay" />
          <Dialog.Content className="reflog-modal">
            {restoreModalEntry && (
              <>
                <div className="reflog-modal-header">
                  <Dialog.Title asChild>
                    <h3 className="reflog-modal-title">
                      <RotateCcw
                        size={16}
                        style={{ color: "var(--color-danger)" }}
                      />
                      Restore Repository State
                    </h3>
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="reflog-modal-close"
                      disabled={isRestoring}
                      aria-label="Close dialog"
                    >
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="reflog-modal-body">
                  <Dialog.Description asChild>
                    <div className="reflog-entry-preview">
                      <div className="reflog-preview-label">
                        Target Ref Entry ({refTarget}@
                        {`{${restoreModalEntry.index}}`} -{" "}
                        {restoreModalEntry.newOid.slice(0, 7)})
                      </div>
                      <div className="reflog-preview-msg">
                        {restoreModalEntry.message}
                      </div>
                    </div>
                  </Dialog.Description>

                  <div className="reflog-mode-options">
                    {/* Mixed Mode (Recommended) */}
                    <label
                      className={`reflog-mode-card ${resetMode === "mixed" ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="resetMode"
                        checked={resetMode === "mixed"}
                        onChange={() => setResetMode("mixed")}
                        className="reflog-mode-radio"
                      />
                      <div className="reflog-mode-info">
                        <span className="reflog-mode-name">
                          Mixed Reset (Recommended)
                        </span>
                        <span className="reflog-mode-desc">
                          Resets HEAD and staging index. Keeps all your working
                          directory files unchanged.
                        </span>
                      </div>
                    </label>
                    {/* Soft Mode */}
                    <label
                      className={`reflog-mode-card ${resetMode === "soft" ? "selected" : ""}`}
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
                          Resets HEAD only. Keeps all uncommitted changes staged
                          in the index.
                        </span>
                      </div>
                    </label>
                    {/* Hard Mode */}
                    <label
                      className={`reflog-mode-card ${resetMode === "hard" ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="resetMode"
                        checked={resetMode === "hard"}
                        onChange={() => setResetMode("hard")}
                        className="reflog-mode-radio"
                      />
                      <div className="reflog-mode-info">
                        <span
                          className="reflog-mode-name"
                          style={{ color: "var(--color-danger)" }}
                        >
                          Hard Reset (Warning: Destructive)
                        </span>
                        <span className="reflog-mode-desc">
                          Discards all uncommitted changes in your working
                          directory to match the target commit exactly.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="reflog-modal-footer">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={isRestoring}
                    >
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleConfirmRestore}
                    disabled={isRestoring}
                  >
                    {isRestoring
                      ? "Restoring..."
                      : `Reset HEAD to ${restoreModalEntry.newOid.slice(0, 7)}`}
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
