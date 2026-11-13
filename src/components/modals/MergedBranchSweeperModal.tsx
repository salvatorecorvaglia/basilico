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
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { BranchInfo } from "../../lib/git-types";
import * as commands from "../../lib/tauri-commands";
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
  const path = useRepoStore((s) => s.activeTabId);
  return path ? (
    <RepositorySweeper
      key={path}
      path={path}
      open={open}
      onOpenChange={onOpenChange}
    />
  ) : null;
}

function RepositorySweeper({
  path,
  open,
  onOpenChange,
}: MergedBranchSweeperModalProps & { path: string }) {
  const { branches, repoInfo } = useRepoStore(
    useShallow((s) => ({ branches: s.branches, repoInfo: s.repoInfo })),
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
  const [scan, setScan] = useState<commands.MergedBranchScan | null>(null);
  const scanRequest = useRef(0);
  const [mergedList, setMergedList] = useState<BranchInfo[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(
    new Set(),
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMerged = useCallback(async () => {
    const ticket = ++scanRequest.current;
    setIsScanning(true);
    setScan(null);
    setMergedList([]);
    setSelectedBranches(new Set());
    try {
      const result = await commands.scanMergedBranches(path, targetBranch);
      if (ticket !== scanRequest.current) return;
      setScan(result);
      setMergedList(result.branches);
      // Deliberately starts empty. Deleting a remote branch pushes the deletion
      // to the server and cannot be undone from Basilico, so bulk deletion must
      // be an explicit choice rather than the default.
      setSelectedBranches(new Set());
    } catch {
      if (ticket !== scanRequest.current) return;
      setScan(null);
      setMergedList([]);
      setSelectedBranches(new Set());
    } finally {
      if (ticket === scanRequest.current) setIsScanning(false);
    }
  }, [path, targetBranch]);

  useEffect(() => {
    if (open) {
      fetchMerged();
    }
    return () => {
      scanRequest.current++;
    };
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

  const runBulkDelete = async (
    targets: BranchInfo[],
    snapshot: commands.MergedBranchScan,
  ) => {
    setIsDeleting(true);
    let successCount = 0;
    const failures: string[] = [];
    try {
      const results = await commands.deleteMergedBranches(
        path,
        snapshot,
        targets,
        { silent: true },
      );
      for (const result of results) {
        if (result.error) failures.push(`${result.name}: ${result.error}`);
        else successCount++;
      }
    } catch (err) {
      failures.push(...targets.map((branch) => `${branch.name}: ${err}`));
    }
    if (useRepoStore.getState().activeTabId === path) {
      await useRepoStore
        .getState()
        .refreshBranches()
        .catch(() => {});
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

    if (useRepoStore.getState().activeTabId === path) onOpenChange(false);
  };

  const handleBulkDelete = () => {
    if (selectedBranches.size === 0 || !scan || isScanning || isDeleting)
      return;

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
      message: `You are about to delete ${summary} from ${path}, merged into ${targetBranch}.${remoteWarning}`,
      confirmLabel: `Delete ${targets.length} branch(es)`,
      cancelLabel: "Cancel",
      isDanger: true,
      onConfirm: () => runBulkDelete(targets, scan),
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
                disabled={isDeleting}
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
              disabled={
                selectedBranches.size === 0 || isDeleting || isScanning || !scan
              }
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
