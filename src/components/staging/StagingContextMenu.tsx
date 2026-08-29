/* ═══════════════════════════════════════════════════════
   Basilico — Staging Row Context Menu
   Stage/unstage/discard actions plus conflict resolution and history
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Calendar, Check, Clock, Plus, Trash2, Undo2 } from "lucide-react";
import type { ActiveView } from "../../lib/git-types";
import { getFileName } from "../../lib/utils";

export interface StagingContextMenuProps {
  filePath: string;
  isStaged: boolean;
  isUntracked: boolean;
  isConflicted: boolean;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardChanges: (files: string[]) => Promise<void>;
  selectLocalFile: (path: string, isStaged: boolean) => Promise<void>;
  resolveConflictWithSide: (
    filePath: string,
    side: "ours" | "theirs",
  ) => Promise<void>;
  setActiveView: (view: ActiveView) => void;
  addNotification: (n: {
    type: "success" | "error" | "info" | "warning";
    message: string;
  }) => void;
  openConfirm: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    isDanger?: boolean;
    onConfirm: () => void | Promise<void>;
  }) => void;
}

/**
 * The context menu shown on every row in the staging list.
 *
 * The four booleans select which items apply: a conflicted row offers
 * "use ours"/"use theirs", an untracked row deletes rather than discards, and
 * a staged row unstages rather than stages. They were previously four
 * positional arguments to a closure inside `StagingArea`, which made every
 * call site a row of bare booleans.
 */
export function StagingContextMenu({
  filePath,
  isStaged,
  isUntracked,
  isConflicted,
  stageFiles,
  unstageFiles,
  discardChanges,
  selectLocalFile,
  resolveConflictWithSide,
  setActiveView,
  addNotification,
  openConfirm,
}: StagingContextMenuProps) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="radix-context-menu">
        {isConflicted && (
          <>
            <ContextMenu.Item
              className="context-menu-item"
              onSelect={async () => {
                try {
                  await resolveConflictWithSide(filePath, "ours");
                  addNotification({
                    type: "success",
                    message: `Resolved conflict in ${getFileName(filePath)} using Ours (Local)`,
                  });
                } catch (err) {
                  addNotification({
                    type: "error",
                    message: `Failed to resolve conflict: ${err}`,
                  });
                }
              }}
            >
              <Check size={12} />
              <span>Accept Ours (Local)</span>
            </ContextMenu.Item>
            <ContextMenu.Item
              className="context-menu-item"
              onSelect={async () => {
                try {
                  await resolveConflictWithSide(filePath, "theirs");
                  addNotification({
                    type: "success",
                    message: `Resolved conflict in ${getFileName(filePath)} using Theirs (Incoming)`,
                  });
                } catch (err) {
                  addNotification({
                    type: "error",
                    message: `Failed to resolve conflict: ${err}`,
                  });
                }
              }}
            >
              <Check size={12} />
              <span>Accept Theirs (Incoming)</span>
            </ContextMenu.Item>
          </>
        )}
        {!isConflicted && (
          <ContextMenu.Item
            className="context-menu-item"
            onSelect={() => {
              if (isStaged) {
                unstageFiles([filePath]);
              } else {
                stageFiles([filePath]);
              }
            }}
          >
            {isStaged ? <Undo2 size={12} /> : <Plus size={12} />}
            <span>{isStaged ? "Unstage File" : "Stage File"}</span>
          </ContextMenu.Item>
        )}
        {!isStaged && !isConflicted && (
          <ContextMenu.Item
            className="context-menu-item danger"
            onSelect={() => {
              openConfirm({
                title: isUntracked ? "Delete File" : "Discard Changes",
                message: isUntracked
                  ? `Are you sure you want to permanently delete ${getFileName(filePath)}?`
                  : `Are you sure you want to discard all changes in ${getFileName(filePath)}? This action cannot be undone.`,
                confirmLabel: isUntracked ? "Delete" : "Discard",
                isDanger: true,
                onConfirm: () => discardChanges([filePath]),
              });
            }}
          >
            <Trash2 size={12} />
            <span>{isUntracked ? "Delete File" : "Discard Changes"}</span>
          </ContextMenu.Item>
        )}
        <ContextMenu.Separator className="context-menu-divider" />
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => {
            selectLocalFile(filePath, isStaged);
            setActiveView("blame");
          }}
        >
          <Clock size={12} />
          <span>View Blame</span>
        </ContextMenu.Item>
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => {
            selectLocalFile(filePath, isStaged);
            setActiveView("history");
          }}
        >
          <Calendar size={12} />
          <span>View File History</span>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}
