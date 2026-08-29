/* ═══════════════════════════════════════════════════════
   Basilico — Commit Context Menu
   Right-click actions on a row in the commit list
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  ArrowLeftRight,
  Check,
  ExternalLink,
  FolderSync,
  GitBranch,
  RotateCcw,
  Scissors,
  Tag,
} from "lucide-react";
import { getCommitUrl } from "../../lib/forge-links";
import type { ActiveView, GraphCommit } from "../../lib/git-types";
import { openExternalUrl } from "../../lib/utils";

export interface CommitContextMenuProps {
  commit: GraphCommit;
  /** Remote whose web UI "Open Commit on Web" targets; omitted when none. */
  defaultRemoteUrl: string | null;
  handleCheckoutCommit: (oid: string) => Promise<void>;
  handleCherryPick: (oid: string) => Promise<void>;
  handleRevert: (oid: string) => Promise<void>;
  handleCreateBranchPrompt: (oid: string) => void;
  handleCreateTagPrompt: (oid: string) => void;
  openResetModal: (oid: string) => void;
  startComparison: (base: string, target: string) => Promise<void>;
  setActiveView: (view: ActiveView) => void;
  /** The commit currently selected in the list, for "compare with selected". */
  selectedCommitOid: string | null;
  addNotification: (n: {
    type: "success" | "error" | "info" | "warning";
    message: string;
  }) => void;
}

/** The right-click menu for a single commit row. */
export function CommitContextMenu({
  commit,
  defaultRemoteUrl,
  handleCheckoutCommit,
  handleCherryPick,
  handleRevert,
  handleCreateBranchPrompt,
  handleCreateTagPrompt,
  openResetModal,
  startComparison,
  setActiveView,
  selectedCommitOid,
  addNotification,
}: CommitContextMenuProps) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="radix-context-menu commit-context-menu">
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => handleCheckoutCommit(commit.oid)}
        >
          <Check size={12} />
          <span>Checkout Commit (Detached HEAD)</span>
        </ContextMenu.Item>
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => handleCherryPick(commit.oid)}
        >
          <Scissors size={12} />
          <span>Cherry-Pick Commit</span>
        </ContextMenu.Item>
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => handleRevert(commit.oid)}
        >
          <RotateCcw size={12} />
          <span>Revert Commit</span>
        </ContextMenu.Item>
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => openResetModal(commit.oid)}
        >
          <FolderSync size={12} />
          <span>Reset current branch here...</span>
        </ContextMenu.Item>
        {defaultRemoteUrl && getCommitUrl(defaultRemoteUrl, commit.oid) && (
          <ContextMenu.Item
            className="context-menu-item"
            onSelect={() => {
              const url = getCommitUrl(defaultRemoteUrl, commit.oid);
              if (url) openExternalUrl(url);
            }}
          >
            <ExternalLink size={12} />
            <span>Open Commit on Web</span>
          </ContextMenu.Item>
        )}
        <ContextMenu.Separator className="context-menu-divider" />
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => {
            startComparison(commit.oid, "HEAD")
              .then(() => setActiveView("compare"))
              .catch((err) =>
                addNotification({
                  type: "error",
                  message: `Comparison failed: ${err}`,
                }),
              );
          }}
        >
          <ArrowLeftRight size={12} />
          <span>Compare with HEAD</span>
        </ContextMenu.Item>
        {selectedCommitOid && selectedCommitOid !== commit.oid && (
          <ContextMenu.Item
            className="context-menu-item"
            onSelect={() => {
              startComparison(selectedCommitOid, commit.oid)
                .then(() => setActiveView("compare"))
                .catch((err) =>
                  addNotification({
                    type: "error",
                    message: `Comparison failed: ${err}`,
                  }),
                );
            }}
          >
            <ArrowLeftRight size={12} />
            <span>Compare with Selected Commit</span>
          </ContextMenu.Item>
        )}
        <ContextMenu.Separator className="context-menu-divider" />
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => handleCreateBranchPrompt(commit.oid)}
        >
          <GitBranch size={12} />
          <span>Create Branch here...</span>
        </ContextMenu.Item>
        <ContextMenu.Item
          className="context-menu-item"
          onSelect={() => handleCreateTagPrompt(commit.oid)}
        >
          <Tag size={12} />
          <span>Create Tag here...</span>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}
