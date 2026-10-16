/* ═══════════════════════════════════════════════════════
   Basilico — CommitDetail Component
   Shows details of the selected commit (changes & file tree)
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  File,
  FileText,
  Folder,
  Layers,
  Tag,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SignatureInfo, TreeEntryInfo } from "../../lib/git-types";
import { describeSignature } from "../../lib/signature-status";
import { getCommitSignature, getCommitTree } from "../../lib/tauri-commands";
import {
  formatDateTime,
  getDirectory,
  getFileName,
  getStatusColor,
  getStatusIcon,
} from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./CommitDetail.css";
import { reportError } from "../../lib/git-error";
import { useCopyFeedback } from "../../lib/use-copy-feedback";

/** Git's well-known empty tree: the "parent" a root commit is compared with. */
const EMPTY_TREE_OID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

interface TreeViewNodeProps {
  entry: TreeEntryInfo;
  level: number;
  loadChildren: (dir: string) => Promise<TreeEntryInfo[]>;
  onFileClick: (path: string) => void;
}

/**
 * One file or folder. A folder fetches its children the first time it is
 * expanded: the whole tree of a large repository used to be walked, sent and
 * re-nested before the first level could be shown.
 */
function TreeViewNode({
  entry,
  level,
  loadChildren,
  onFileClick,
}: TreeViewNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<TreeEntryInfo[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (!entry.isDir) {
      onFileClick(entry.path);
      return;
    }
    if (!isOpen && children === null && !loading) {
      setLoading(true);
      loadChildren(entry.path)
        .then(setChildren)
        .catch((err) => {
          setChildren([]);
          reportError(err, `Failed to list ${entry.path}`);
        })
        .finally(() => setLoading(false));
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="tree-node">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={entry.isDir ? isOpen : undefined}
        className={`tree-node-row ${entry.isDir ? "dir" : "file"}`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick(e);
          }
        }}
      >
        {entry.isDir ? (
          <span className="tree-node-chevron">
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="tree-node-spacer" />
        )}

        <span className="tree-node-icon">
          {entry.isDir ? (
            <Folder size={12} className="icon-folder" />
          ) : (
            <File size={12} className="icon-file" />
          )}
        </span>

        <span className="tree-node-name truncate">{entry.name}</span>

        {!entry.isDir && entry.size !== null && (
          <span className="tree-node-size text-mono">
            {formatBytes(entry.size)}
          </span>
        )}
      </div>

      {entry.isDir && isOpen && (
        <div className="tree-node-children">
          {loading && (
            <div className="tree-node-loading text-tertiary">Loading…</div>
          )}
          {children?.map((child) => (
            <TreeViewNode
              // Keyed by path: each node holds its own open/loaded state.
              key={child.path}
              entry={child}
              level={level + 1}
              loadChildren={loadChildren}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommitDetail() {
  const {
    activeTabId,
    commits,
    selectedCommitOid,
    commitDiff,
    selectLocalFile,
    createTag,
    commitTree,
    loadCommitTree,
    startComparison,
    selectCompareFile,
    isLoading,
  } = useRepoStore(
    useShallow((s) => ({
      activeTabId: s.activeTabId,
      commits: s.commits,
      selectedCommitOid: s.selectedCommitOid,
      commitDiff: s.commitDiff,
      selectLocalFile: s.selectLocalFile,
      createTag: s.createTag,
      commitTree: s.commitTree,
      loadCommitTree: s.loadCommitTree,
      startComparison: s.startComparison,
      selectCompareFile: s.selectCompareFile,
      isLoading: s.isLoading,
    })),
  );

  const { setActiveView, addNotification, openFileViewer, openPrompt } =
    useUIStore(
      useShallow((s) => ({
        setActiveView: s.setActiveView,
        addNotification: s.addNotification,
        openFileViewer: s.openFileViewer,
        openPrompt: s.openPrompt,
      })),
    );
  const { isCopied, markCopied } = useCopyFeedback();
  const copiedOid = isCopied();
  const [activeTab, setActiveTab] = useState<"changes" | "tree">("changes");
  const [sigInfo, setSigInfo] = useState<SignatureInfo | null>(null);

  const commit = commits.find((c) => c.oid === selectedCommitOid);

  // Lazy-load tree when tab changes
  useEffect(() => {
    if (activeTab === "tree" && selectedCommitOid) {
      loadCommitTree(selectedCommitOid).catch((err) =>
        reportError(err, "Failed to load commit tree"),
      );
    }
  }, [activeTab, selectedCommitOid, loadCommitTree]);

  // Load GPG signature details
  useEffect(() => {
    setSigInfo(null);
    if (!activeTabId || !selectedCommitOid) return;

    // Arrowing quickly through the log could let an earlier commit's lookup
    // land last and badge the current commit with the wrong signature.
    let cancelled = false;
    getCommitSignature(activeTabId, selectedCommitOid)
      .then((info) => {
        if (!cancelled) setSigInfo(info);
      })
      .catch((err) => {
        console.error("Failed to load commit signature:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTabId, selectedCommitOid]);

  // Reset tab on commit change.
  //
  // The dependency array was empty, so this only ever ran on mount: selecting a
  // different commit left the File Tree tab open, showing the previous commit's
  // tree until loadCommitTree resolved.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `selectedCommitOid` is the trigger, not a value the body reads — this effect exists to reset the tab *when the commit changes*.
  useEffect(() => {
    setActiveTab("changes");
  }, [selectedCommitOid]);

  // Deeper folders of the selected commit's tree, fetched on expand.
  const loadTreeDir = useCallback(
    (dir: string) =>
      activeTabId && selectedCommitOid
        ? getCommitTree(activeTabId, selectedCommitOid, dir, { silent: true })
        : Promise.resolve([]),
    [activeTabId, selectedCommitOid],
  );

  if (!commit) {
    return (
      <div className="commit-detail-empty">
        <FileText size={32} strokeWidth={1} />
        <p>Select a commit to view details</p>
      </div>
    );
  }

  // What this commit changed in the file: its first parent (or, for a root
  // commit, the empty tree) against the commit. This used to open the file's
  // *working-tree* diff in Staging, which has nothing to do with the commit.
  const openCommitFileDiff = (filePath: string) => {
    const base = commit.parentOids[0] ?? EMPTY_TREE_OID;
    startComparison(base, commit.oid)
      .then(() => selectCompareFile(filePath))
      .catch((err) => reportError(err, "Failed to load the commit's changes"));
    setActiveView("compare");
  };

  const handleCopyOid = () => {
    navigator.clipboard
      .writeText(commit.oid)
      .catch((err) => reportError(err, "Could not copy to clipboard"));
    markCopied();
  };

  const handleCreateTagPrompt = () => {
    if (!commit) return;
    openPrompt({
      title: "Create Tag",
      description: `Create a new tag at commit ${commit.oid.slice(0, 7)}.`,
      fields: [
        {
          name: "name",
          label: "Tag Name",
          placeholder: "e.g. v1.2.0",
          required: true,
        },
        {
          name: "message",
          label: "Tag Message (optional)",
          placeholder: "e.g. Release version",
          type: "textarea",
        },
      ],
      submitLabel: "Create Tag",
      onSubmit: async (values) => {
        const name = values.name.trim();
        const message = values.message.trim();
        try {
          await createTag(name, commit.oid, message || null);
          addNotification({
            type: "success",
            message: `Created tag "${name}" at ${commit.oid.slice(0, 7)}`,
          });
        } catch (err) {
          reportError(err, "Failed to create tag");
        }
      },
    });
  };

  return (
    <div className="commit-detail">
      {/* Header */}
      <div className="commit-detail-header">
        <div className="commit-detail-message">{commit.message}</div>
        <div className="commit-detail-meta">
          <div className="commit-detail-author">
            <strong>{commit.authorName}</strong>
            <span className="text-secondary">
              {" "}
              &lt;{commit.authorEmail}&gt;
            </span>
            {sigInfo &&
              (() => {
                const sig = describeSignature(sigInfo.status);
                const SigIcon = sig.icon;
                return (
                  <span
                    // role="img" so the badge is announced as a single unit;
                    // a bare span has no role that supports aria-label.
                    role="img"
                    className={`commit-gpg-badge commit-gpg-badge--${sig.tone}`}
                    aria-label={`Signature ${sig.label}. ${sig.hint}`}
                    title={`${sig.hint}\nGPG Key ID: ${sigInfo.keyId}\nSigner: ${sigInfo.signer}`}
                  >
                    <SigIcon size={12} aria-hidden="true" />
                    <span>{sig.label}</span>
                  </span>
                );
              })()}
          </div>
          <div className="commit-detail-date text-secondary">
            {formatDateTime(commit.authorDate)}
          </div>
        </div>

        <div className="commit-detail-oid">
          <span className="text-mono text-secondary">{commit.oid}</span>
          <button
            type="button"
            className="commit-detail-copy"
            onClick={handleCopyOid}
            title="Copy SHA"
          >
            {copiedOid ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            type="button"
            className="commit-detail-action-btn"
            onClick={handleCreateTagPrompt}
            title="Create Tag at this commit"
          >
            <Tag size={12} />
            <span>Tag...</span>
          </button>
        </div>

        {commit.parentOids.length > 0 && (
          <div className="commit-detail-parents">
            <span className="text-tertiary">Parents:</span>
            {commit.parentOids.map((parent) => (
              <span key={parent} className="commit-detail-parent-oid text-mono">
                {parent.slice(0, 7)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="commit-detail-tabs-bar">
        <button
          type="button"
          className={`commit-detail-tab-btn ${activeTab === "changes" ? "active" : ""}`}
          onClick={() => setActiveTab("changes")}
        >
          <Layers size={12} />
          <span>Changes ({commitDiff.length})</span>
        </button>
        <button
          type="button"
          className={`commit-detail-tab-btn ${activeTab === "tree" ? "active" : ""}`}
          onClick={() => setActiveTab("tree")}
        >
          <Folder size={12} />
          <span>File Tree</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="commit-detail-panel-content">
        {activeTab === "changes" ? (
          <div className="commit-detail-files">
            <div className="commit-detail-files-list">
              {isLoading && commitDiff.length === 0 ? (
                <div className="skeleton-stack commit-detail-skeleton">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="skeleton-row commit-detail-skeleton-row"
                    >
                      <div className="skeleton-shimmer skeleton-line flush commit-detail-skeleton-icon" />
                      <div
                        className="skeleton-shimmer skeleton-line flush"
                        style={{ width: `${40 + (i % 3) * 15}%` }}
                      />
                      <div className="skeleton-shimmer skeleton-line flush commit-detail-skeleton-stats" />
                    </div>
                  ))}
                </div>
              ) : commitDiff.length === 0 ? (
                <div className="commit-detail-no-changes">
                  No files modified in this commit
                </div>
              ) : (
                commitDiff.map((file, i) => {
                  const filePath = file.newPath || file.oldPath || "";
                  return (
                    <ContextMenu.Root key={i}>
                      <ContextMenu.Trigger>
                        <div
                          role="button"
                          tabIndex={0}
                          className="commit-detail-file"
                          onClick={() => openCommitFileDiff(filePath)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openCommitFileDiff(filePath);
                            }
                          }}
                        >
                          <span
                            className="commit-detail-file-status"
                            style={{ color: getStatusColor(file.status) }}
                          >
                            {getStatusIcon(file.status)}
                          </span>
                          <span className="commit-detail-file-dir text-tertiary truncate">
                            {getDirectory(filePath)}
                            {getDirectory(filePath) && "/"}
                          </span>
                          <span className="commit-detail-file-name truncate">
                            {getFileName(filePath)}
                          </span>
                          <span className="commit-detail-file-stats text-mono">
                            <span className="stat-add">
                              +{file.stats.additions}
                            </span>
                            <span className="stat-del">
                              -{file.stats.deletions}
                            </span>
                          </span>
                        </div>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content className="radix-context-menu">
                          <ContextMenu.Item
                            className="context-menu-item"
                            onSelect={() => {
                              selectLocalFile(filePath, false).catch((err) =>
                                reportError(err, "Failed to load file"),
                              );
                              setActiveView("blame");
                            }}
                          >
                            <Clock size={12} />
                            <span>View Blame</span>
                          </ContextMenu.Item>
                          <ContextMenu.Item
                            className="context-menu-item"
                            onSelect={() => {
                              selectLocalFile(filePath, false).catch((err) =>
                                reportError(err, "Failed to load file"),
                              );
                              setActiveView("history");
                            }}
                          >
                            <Calendar size={12} />
                            <span>View File History</span>
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu.Root>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="commit-detail-tree">
            {isLoading && commitTree.length === 0 ? (
              <div className="tree-loader">
                <span className="spinner-small" />
                <p>Loading commit tree...</p>
              </div>
            ) : commitTree.length === 0 ? (
              <div className="tree-empty">Unable to read tree structure</div>
            ) : (
              // Keyed by commit so a newly selected commit starts collapsed
              // instead of inheriting the previous one's expanded folders.
              <div className="tree-viewport" key={commit.oid}>
                {commitTree.map((entry) => (
                  <TreeViewNode
                    key={entry.path}
                    entry={entry}
                    level={1}
                    loadChildren={loadTreeDir}
                    onFileClick={(path) => openFileViewer(path, commit.oid)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
