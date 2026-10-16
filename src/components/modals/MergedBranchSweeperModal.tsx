/* ═══════════════════════════════════════════════════════
   Basilico — Merged Branch Sweeper Modal
   Detects and bulk-prunes merged local & remote branches
   ═══════════════════════════════════════════════════════ */

import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  CheckSquare,
  GitBranch,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { BranchInfo } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./ToolModal.css";

interface MergedBranchSweeperModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MergedBranchSweeperModal({
  open,
  onOpenChange,
}: MergedBranchSweeperModalProps) {
  const { branches, listMergedBranches, deleteBranch, repoInfo } = useRepoStore(
    useShallow((s) => ({
      branches: s.branches,
      listMergedBranches: s.listMergedBranches,
      deleteBranch: s.deleteBranch,
      repoInfo: s.repoInfo,
    })),
  );
  const { addNotification, openConfirm } = useUIStore(
    useShallow((s) => ({
      addNotification: s.addNotification,
      openConfirm: s.openConfirm,
    })),
  );

  const [targetBranch, setTargetBranch] = useState<string>(
    repoInfo?.headBranch || "main",
  );
  const [mergedList, setMergedList] = useState<BranchInfo[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(
    new Set(),
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMerged = useCallback(async () => {
    setIsScanning(true);
    try {
      const list = await listMergedBranches(targetBranch);
      setMergedList(list);
      // Deliberately starts empty. Deleting a remote branch pushes the deletion
      // to the server and cannot be undone from Basilico, so bulk deletion must
      // be an explicit choice rather than the default.
      setSelectedBranches(new Set());
    } catch {
      setMergedList([]);
      setSelectedBranches(new Set());
    } finally {
      setIsScanning(false);
    }
  }, [targetBranch, listMergedBranches]);

  useEffect(() => {
    if (open) {
      fetchMerged();
    }
  }, [open, fetchMerged]);

  const toggleSelectAll = () => {
    if (selectedBranches.size === mergedList.length) {
      setSelectedBranches(new Set());
    } else {
      setSelectedBranches(new Set(mergedList.map((b) => b.name)));
    }
  };

  const toggleBranch = (name: string) => {
    const next = new Set(selectedBranches);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedBranches(next);
  };

  const runBulkDelete = async (targets: BranchInfo[]) => {
    setIsDeleting(true);

    let successCount = 0;
    const failures: string[] = [];

    for (const bInfo of targets) {
      try {
        await deleteBranch(bInfo.name, bInfo.isRemote);
        successCount++;
      } catch (err) {
        failures.push(`${bInfo.name}: ${err}`);
      }
    }

    setIsDeleting(false);

    if (successCount > 0) {
      addNotification({
        type: "success",
        message: `Successfully pruned ${successCount} merged branch(es)`,
      });
    }
    if (failures.length > 0) {
      // Naming the branches that survived matters: a partial failure otherwise
      // leaves the user unsure which deletions actually reached the remote.
      addNotification({
        type: "error",
        message: `Failed to delete ${failures.length} branch(es)`,
        description: failures.join("\n"),
      });
    }

    onOpenChange(false);
  };

  const handleBulkDelete = () => {
    if (selectedBranches.size === 0) return;

    const targets = mergedList.filter((b) => selectedBranches.has(b.name));
    if (targets.length === 0) return;

    const remoteTargets = targets.filter((b) => b.isRemote);
    const localCount = targets.length - remoteTargets.length;

    const summary = [
      localCount > 0 ? `${localCount} local branch(es)` : null,
      remoteTargets.length > 0
        ? `${remoteTargets.length} remote branch(es)`
        : null,
    ]
      .filter(Boolean)
      .join(" and ");

    const remoteWarning =
      remoteTargets.length > 0
        ? `\n\nDeleting a remote branch pushes the deletion to the server for everyone. This cannot be undone from Basilico.\n\nRemote branches:\n${remoteTargets
            .map((b) => `  • ${b.name}`)
            .join("\n")}`
        : "";

    openConfirm({
      title: "Delete merged branches?",
      message: `You are about to delete ${summary}.${remoteWarning}`,
      confirmLabel: `Delete ${targets.length} branch(es)`,
      cancelLabel: "Cancel",
      isDanger: true,
      onConfirm: () => runBulkDelete(targets),
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content className="settings-modal tool-modal tool-modal-sweeper">
          {/* Header */}
          <div className="settings-header">
            <Dialog.Title asChild>
              <h2>
                <GitBranch size={18} />
                Merged Branch Sweeper
              </h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="settings-close-btn"
                aria-label="Close sweeper"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="settings-body tool-modal-body">
            <div className="sweeper-target">
              <label
                className="sweeper-target-label"
                htmlFor="sweeper-target-branch"
              >
                Merged into:
              </label>
              <select
                id="sweeper-target-branch"
                className="settings-input sweeper-target-select"
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
              >
                {(branches || []).map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} {b.isHead ? "(HEAD)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="settings-btn settings-btn-outline"
                onClick={fetchMerged}
                disabled={isScanning}
                title="Rescan merged branches"
              >
                <RefreshCw
                  size={12}
                  className={isScanning ? "animate-spin" : ""}
                />
                <span>Rescan</span>
              </button>
            </div>

            {isScanning ? (
              <div className="tool-modal-state">
                <span className="spinner-large" />
                <p className="tool-modal-state-text">
                  Scanning for merged branches...
                </p>
              </div>
            ) : mergedList.length === 0 ? (
              <div className="tool-modal-state">
                <Check className="tool-modal-state-icon accent" size={32} />
                <p className="tool-modal-strong">No Merged Branches Found</p>
                <p className="tool-modal-small">
                  All local and remote branches contain unmerged work relative
                  to {targetBranch}.
                </p>
              </div>
            ) : (
              <>
                <div className="sweeper-list-header">
                  <button
                    className="sweeper-select-all"
                    type="button"
                    onClick={toggleSelectAll}
                  >
                    {selectedBranches.size === mergedList.length ? (
                      <CheckSquare size={13} />
                    ) : (
                      <Square size={13} />
                    )}
                    <span>
                      {selectedBranches.size === mergedList.length
                        ? "Deselect All"
                        : "Select All"}
                    </span>
                  </button>
                  <span className="text-tertiary">
                    {selectedBranches.size} of {mergedList.length} selected
                  </span>
                </div>

                <div className="tool-modal-list sweeper-list">
                  {mergedList.map((b) => {
                    const isSelected = selectedBranches.has(b.name);
                    return (
                      // A label makes the whole row clickable *and* keyboard
                      // reachable via the checkbox, without hand-rolled key
                      // handlers on a div.
                      <label
                        key={b.name}
                        className={`sweeper-row ${isSelected ? "selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleBranch(b.name)}
                        />
                        <GitBranch size={13} className="text-secondary" />
                        <span className="sweeper-branch-name">{b.name}</span>
                        <span
                          className={`commit-ref ${b.isRemote ? "ref-remote" : "ref-branch"} tool-modal-tiny`}
                        >
                          {b.isRemote ? "Remote" : "Local"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="settings-footer">
            <button
              type="button"
              className="settings-btn settings-btn-outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-btn sweeper-delete-btn"
              disabled={selectedBranches.size === 0 || isDeleting}
              onClick={handleBulkDelete}
            >
              <Trash2 size={13} />
              <span>
                {isDeleting
                  ? "Deleting..."
                  : `Prune Selected (${selectedBranches.size})`}
              </span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
