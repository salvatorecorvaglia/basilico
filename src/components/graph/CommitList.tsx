/* ═══════════════════════════════════════════════════════
   Basilico — CommitList Component
   TanStack Table + Virtualization + Radix Context Menu + Keyboard Nav
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { flexRender, type SortingState } from "@tanstack/react-table";
import {
  legacyCreateColumnHelper as createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type LegacyColumnDef,
  useLegacyTable as useReactTable,
} from "@tanstack/react-table/legacy";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  EyeOff,
  Filter,
  FolderSync,
  GitBranch,
  GitMerge,
  RotateCcw,
  Scissors,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { buildAutolinkSegments } from "../../lib/autolink";
import { getCommitUrl } from "../../lib/forge-links";
import type { GraphCommit, RefLabel } from "../../lib/git-types";
import { validateTagName } from "../../lib/git-validation";
import {
  formatRelativeTime,
  getInitials,
  stringToColor,
} from "../../lib/utils";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import { MergedBranchSweeperModal } from "../modals/MergedBranchSweeperModal";
import { CommitGraph } from "./CommitGraph";
import "./CommitList.css";

const ROW_HEIGHT = 34;
const GRAPH_WIDTH = 120;

function RefBadge({ ref: refLabel }: { ref: RefLabel }) {
  const classes = ["commit-ref"];
  switch (refLabel.kind) {
    case "Head":
      classes.push("ref-head");
      break;
    case "LocalBranch":
      classes.push("ref-branch");
      break;
    case "RemoteBranch":
      classes.push("ref-remote");
      break;
    case "Tag":
      classes.push("ref-tag");
      break;
  }

  return <span className={classes.join(" ")}>{refLabel.name}</span>;
}

const columnHelper = createColumnHelper<GraphCommit>();

export function CommitList() {
  const {
    commits,
    selectedCommitOid,
    selectCommit,
    loadMoreCommits,
    checkoutBranch,
    createBranch,
    createTag,
    cherryPickCommit,
    revertCommit,
    startComparison,
    isLoading,
    settings,
    remotes,
    firstParentOnly,
    hideRemoteBranches,
    pathFilter,
    setGraphFilters,
  } = useRepoStore(
    useShallow((s) => ({
      commits: s.commits,
      selectedCommitOid: s.selectedCommitOid,
      selectCommit: s.selectCommit,
      loadMoreCommits: s.loadMoreCommits,
      checkoutBranch: s.checkoutBranch,
      createBranch: s.createBranch,
      createTag: s.createTag,
      cherryPickCommit: s.cherryPickCommit,
      revertCommit: s.revertCommit,
      startComparison: s.startComparison,
      isLoading: s.isLoading,
      settings: s.settings,
      remotes: s.remotes,
      firstParentOnly: s.firstParentOnly,
      hideRemoteBranches: s.hideRemoteBranches,
      pathFilter: s.pathFilter,
      setGraphFilters: s.setGraphFilters,
    })),
  );

  const {
    openResetModal,
    addNotification,
    setActiveView,
    openPrompt,
    openConfirm,
  } = useUIStore(
    useShallow((s) => ({
      openResetModal: s.openResetModal,
      addNotification: s.addNotification,
      setActiveView: s.setActiveView,
      openPrompt: s.openPrompt,
      openConfirm: s.openConfirm,
    })),
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sweeperOpen, setSweeperOpen] = useState(false);

  const handleDropOnCommit = (draggedBranch: string, targetOid: string) => {
    openConfirm({
      title: "Reset Branch to Commit",
      message: `Would you like to checkout branch "${draggedBranch}" and reset it to commit ${targetOid.slice(0, 7)}?`,
      confirmLabel: "Reset Branch",
      cancelLabel: "Cancel",
      onConfirm: async () => {
        try {
          await checkoutBranch(draggedBranch);
          openResetModal(targetOid);
        } catch (err) {
          addNotification({
            type: "error",
            message: `Action failed: ${err}`,
          });
        }
      },
    });
  };

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columns = useMemo<LegacyColumnDef<GraphCommit, any>[]>(
    () => [
      columnHelper.accessor("shortOid", {
        id: "sha",
        header: "SHA",
        cell: (info) => (
          <span className="commit-col-sha-cell">{info.getValue()}</span>
        ),
        size: 70,
      }),
      columnHelper.accessor("message", {
        id: "message",
        header: "Message",
        cell: (info) => {
          const message = info.getValue();
          const segments = buildAutolinkSegments(
            message,
            settings?.autolinkPattern,
            settings?.autolinkUrl,
          );

          return (
            <span className="commit-message truncate">
              {segments.map((segment, idx) =>
                segment.url ? (
                  <a
                    // Segments are positional; the index is the stable identity
                    // for a given message render.
                    key={`${idx}-${segment.text}`}
                    href={segment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="autolink"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {segment.text}
                  </a>
                ) : (
                  segment.text
                ),
              )}
            </span>
          );
        },
        size: 280,
      }),
      columnHelper.display({
        id: "branch",
        header: "Branch",
        cell: (info) => {
          const commit = info.row.original;
          const branchRefs = commit.refs.filter(
            (r) =>
              r.kind === "LocalBranch" ||
              r.kind === "RemoteBranch" ||
              r.kind === "Head",
          );
          return (
            <div className="commit-ref-list">
              {branchRefs.map((ref, idx) => (
                <RefBadge key={idx} ref={ref} />
              ))}
            </div>
          );
        },
        size: 110,
      }),
      columnHelper.display({
        id: "tags",
        header: "Tags",
        cell: (info) => {
          const commit = info.row.original;
          const tagRefs = commit.refs.filter((r) => r.kind === "Tag");
          return (
            <div className="commit-ref-list">
              {tagRefs.map((ref, idx) => (
                <RefBadge key={idx} ref={ref} />
              ))}
            </div>
          );
        },
        size: 90,
      }),
      columnHelper.accessor("authorName", {
        id: "author",
        header: "Author",
        cell: (info) => (
          <div className="commit-col-author-cell">
            <span
              className="commit-avatar"
              style={{ background: stringToColor(info.getValue()) }}
            >
              {getInitials(info.getValue())}
            </span>
            <span className="commit-author-name truncate">
              {info.getValue()}
            </span>
          </div>
        ),
        size: 130,
      }),
      columnHelper.accessor("authorDate", {
        id: "date",
        header: "Date",
        cell: (info) => (
          <span className="commit-col-date-cell">
            {formatRelativeTime(info.getValue())}
          </span>
        ),
        size: 95,
      }),
    ],
    [settings?.autolinkPattern, settings?.autolinkUrl],
  );

  const table = useReactTable({
    data: commits,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: "onChange",
  });

  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // The keyboard handler needs the current rows and selection, but making them
  // effect dependencies re-registered the window listener on every arrow key.
  // A ref gives the handler fresh values with a listener that binds once.
  const navStateRef = useRef({
    rows,
    selectedCommitOid,
    virtualizer,
    selectCommit,
    setActiveView,
    vimModeEnabled: !!settings?.vimModeEnabled,
  });
  navStateRef.current = {
    rows,
    selectedCommitOid,
    virtualizer,
    selectCommit,
    setActiveView,
    vimModeEnabled: !!settings?.vimModeEnabled,
  };

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 500) {
      loadMoreCommits(500);
    }
  }, [loadMoreCommits]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest(".monaco-editor"));
      if (isInput) return;

      const {
        rows: currentRows,
        selectedCommitOid: currentOid,
        virtualizer: currentVirtualizer,
        selectCommit: currentSelect,
        setActiveView: currentSetView,
        vimModeEnabled: isVim,
      } = navStateRef.current;

      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        (isVim && (e.key === "j" || e.key === "k"))
      ) {
        e.preventDefault();
        const currentIndex = currentRows.findIndex(
          (r) => r.original.oid === currentOid,
        );
        let nextIndex = currentIndex;
        if (e.key === "ArrowDown" || (isVim && e.key === "j")) {
          nextIndex =
            currentIndex < currentRows.length - 1
              ? currentIndex + 1
              : currentIndex;
        } else if (e.key === "ArrowUp" || (isVim && e.key === "k")) {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }

        const nextRow = currentRows[nextIndex];
        if (nextRow) {
          currentSelect(nextRow.original.oid);
          currentVirtualizer.scrollToIndex(nextIndex);
        }
      } else if (isVim && e.key === "s") {
        e.preventDefault();
        currentSetView("staging");
      } else if (isVim && e.key === "/") {
        e.preventDefault();
        const searchInput = document.querySelector(
          ".commit-list-search-input",
        ) as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // Bound once: everything mutable is read through navStateRef.
  }, []);

  // Render loading skeleton
  if (isLoading && commits.length === 0) {
    return (
      <div className="commit-list-container">
        <div className="commit-list-controls">
          <div className="commit-list-search-wrapper">
            <Search size={13} className="commit-list-search-icon" />
            <div
              className="skeleton-shimmer skeleton-line"
              style={{ width: "80px", height: "12px", marginBottom: 0 }}
            />
          </div>
        </div>
        <div className="commit-list-header">
          <div
            className="commit-list-header-graph"
            style={{ width: GRAPH_WIDTH }}
          />
          <div className="commit-list-header-cell" style={{ width: "70px" }}>
            SHA
          </div>
          <div className="commit-list-header-cell flex-1">Message</div>
          <div className="commit-list-header-cell" style={{ width: "110px" }}>
            Branch
          </div>
          <div className="commit-list-header-cell" style={{ width: "90px" }}>
            Tags
          </div>
          <div className="commit-list-header-cell" style={{ width: "130px" }}>
            Author
          </div>
          <div className="commit-list-header-cell" style={{ width: "95px" }}>
            Date
          </div>
        </div>
        <div
          className="commit-list-scroll"
          style={{ padding: "var(--space-1) 0", overflow: "hidden" }}
        >
          {Array.from({ length: 15 }).map((_, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                height: `${ROW_HEIGHT}px`,
                borderBottom: "1px solid var(--border-subtle)",
                gap: "var(--space-4)",
                padding: "0 var(--space-3)",
              }}
            >
              <div style={{ width: GRAPH_WIDTH }} />
              <div
                className="skeleton-shimmer skeleton-line"
                style={{
                  width: `${50 + (index % 3) * 15}%`,
                  height: "12px",
                  marginBottom: 0,
                  flex: 1,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const handleCheckoutCommit = async (oid: string) => {
    try {
      await checkoutBranch(oid);
      addNotification({
        type: "success",
        message: `Checked out commit ${oid.slice(0, 7)} (detached HEAD)`,
      });
    } catch (err) {
      addNotification({ type: "error", message: `Checkout failed: ${err}` });
    }
  };

  const handleCherryPick = async (oid: string) => {
    try {
      const res = await cherryPickCommit(oid);
      if (res === "conflicts") {
        addNotification({
          type: "warning",
          message: `Cherry-pick conflict at commit ${oid.slice(0, 7)}. Please resolve conflicts in staging.`,
        });
      } else {
        addNotification({
          type: "success",
          message: `Successfully cherry-picked commit ${oid.slice(0, 7)}`,
        });
      }
    } catch (err) {
      addNotification({ type: "error", message: `Cherry-pick failed: ${err}` });
    }
  };

  const handleRevert = async (oid: string) => {
    try {
      const res = await revertCommit(oid);
      if (res === "conflicts") {
        addNotification({
          type: "warning",
          message: `Revert conflict at commit ${oid.slice(0, 7)}. Please resolve conflicts in staging.`,
        });
      } else {
        addNotification({
          type: "success",
          message: `Successfully reverted commit ${oid.slice(0, 7)}`,
        });
      }
    } catch (err) {
      addNotification({ type: "error", message: `Revert failed: ${err}` });
    }
  };

  const handleCreateBranchPrompt = (oid: string) => {
    openPrompt({
      title: "Create Branch",
      description: `Create a new branch at commit ${oid.slice(0, 7)}.`,
      fields: [
        {
          name: "name",
          label: "Branch Name",
          placeholder: "e.g. feature/checkout-fix",
          required: true,
        },
      ],
      submitLabel: "Create Branch",
      onSubmit: async (values) => {
        const name = values.name.trim();
        try {
          await createBranch(name, oid);
          addNotification({
            type: "success",
            message: `Created branch "${name}" at ${oid.slice(0, 7)}`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to create branch: ${err}`,
          });
        }
      },
    });
  };

  const handleCreateTagPrompt = (oid: string) => {
    openPrompt({
      title: "Create Tag",
      description: `Create a new tag at commit ${oid.slice(0, 7)}.`,
      fields: [
        {
          name: "name",
          label: "Tag Name",
          placeholder: "e.g. v1.1.2",
          required: true,
        },
        {
          name: "message",
          label: "Tag Message (optional)",
          placeholder: "e.g. Tag release at commit OID",
          type: "textarea",
        },
      ],
      submitLabel: "Create Tag",
      onSubmit: async (values) => {
        const name = values.name.trim();
        const message = values.message.trim();
        const validationError = validateTagName(name);
        if (validationError) {
          addNotification({ type: "error", message: validationError });
          return;
        }
        try {
          await createTag(name, oid, message || null);
          addNotification({
            type: "success",
            message: `Created tag "${name}" at ${oid.slice(0, 7)}`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to create tag: ${err}`,
          });
        }
      },
    });
  };

  if (commits.length === 0 && !isLoading) {
    return (
      <div className="commit-list-empty">
        <GitBranch
          size={32}
          className="text-tertiary"
          style={{ marginBottom: "var(--space-3)" }}
        />
        <p style={{ fontWeight: 500, marginBottom: "var(--space-2)" }}>
          No commits yet
        </p>
        <p
          className="text-tertiary"
          style={{
            fontSize: "var(--font-size-sm)",
            maxWidth: "280px",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          This repository has no commits. Stage some files and create your first
          commit to get started.
        </p>
      </div>
    );
  }

  const maxLane = commits.reduce((max, c) => Math.max(max, c.lane), 0);

  return (
    <div className="commit-list-container">
      {/* Controls */}
      <div
        className="commit-list-controls"
        style={{
          display: "flex",
          gap: "var(--space-2)",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div
          className="commit-list-search-wrapper"
          style={{ flex: 1, minWidth: "160px" }}
        >
          <Search size={13} className="commit-list-search-icon" />
          <input
            type="text"
            className="commit-list-search-input"
            placeholder="Search commits..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>

        {/* Path Filter */}
        <div className="commit-list-search-wrapper" style={{ width: "160px" }}>
          <Filter size={12} className="commit-list-search-icon" />
          <input
            type="text"
            className="commit-list-search-input"
            placeholder="Filter by path..."
            value={pathFilter}
            onChange={(e) => setGraphFilters({ pathFilter: e.target.value })}
          />
        </div>

        {/* Topology Toggles */}
        <button
          type="button"
          className={`hunk-btn ${firstParentOnly ? "hunk-btn-primary" : "hunk-btn-secondary"}`}
          onClick={() => setGraphFilters({ firstParentOnly: !firstParentOnly })}
          title="First Parent Only (--first-parent)"
          style={{ height: "26px", fontSize: "11px" }}
        >
          <GitMerge size={12} />
          <span>First-Parent</span>
        </button>

        <button
          type="button"
          className={`hunk-btn ${hideRemoteBranches ? "hunk-btn-primary" : "hunk-btn-secondary"}`}
          onClick={() =>
            setGraphFilters({ hideRemoteBranches: !hideRemoteBranches })
          }
          title="Hide Remote Branches"
          style={{ height: "26px", fontSize: "11px" }}
        >
          <EyeOff size={12} />
          <span>Local Only</span>
        </button>

        <button
          type="button"
          className="hunk-btn hunk-btn-secondary"
          onClick={() => setSweeperOpen(true)}
          title="Detect and prune merged branches"
          style={{ height: "26px", fontSize: "11px" }}
        >
          <Trash2 size={12} />
          <span>Sweep Merged</span>
        </button>
      </div>

      <MergedBranchSweeperModal
        open={sweeperOpen}
        onOpenChange={setSweeperOpen}
      />

      {/* Header */}
      <div className="commit-list-header">
        <div
          className="commit-list-header-graph"
          style={{ width: GRAPH_WIDTH }}
        >
          Graph
        </div>
        {table.getHeaderGroups()[0].headers.map((header) => (
          <div
            key={header.id}
            role="columnheader"
            tabIndex={0}
            aria-sort={
              header.column.getIsSorted() === "asc"
                ? "ascending"
                : header.column.getIsSorted() === "desc"
                  ? "descending"
                  : "none"
            }
            className="commit-list-header-cell"
            style={{ width: `${header.getSize()}px` }}
            onClick={header.column.getToggleSortingHandler()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                header.column.toggleSorting();
              }
            }}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
            {header.column.getIsSorted() ? (
              header.column.getIsSorted() === "desc" ? (
                <ChevronDown
                  size={11}
                  style={{
                    marginLeft: "4px",
                    color: "var(--accent-primary)",
                    display: "inline-block",
                  }}
                />
              ) : (
                <ChevronUp
                  size={11}
                  style={{
                    marginLeft: "4px",
                    color: "var(--accent-primary)",
                    display: "inline-block",
                  }}
                />
              )
            ) : null}
            {/* Presentational drag grip: column widths are a pointer-only
                affordance, and the onClick exists solely to stop the drag from
                also triggering the header's sort. */}
            <div
              role="presentation"
              onMouseDown={header.getResizeHandler()}
              onTouchStart={header.getResizeHandler()}
              className={`resizer ${header.column.getIsResizing() ? "isResizing" : ""}`}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ))}
      </div>

      {/* Scroll area */}
      <div
        ref={parentRef}
        className="commit-list-scroll"
        onScroll={handleScroll}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {/* Graph canvas overlay */}
          <CommitGraph
            commits={commits}
            rowHeight={ROW_HEIGHT}
            graphWidth={GRAPH_WIDTH}
            scrollOffset={virtualizer.scrollOffset ?? 0}
            containerHeight={containerHeight}
            maxLane={maxLane}
          />

          {/* Table rows */}
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const commit = row.original;
            const isSelected = commit.oid === selectedCommitOid;

            return (
              <ContextMenu.Root key={commit.oid}>
                <ContextMenu.Trigger>
                  <div
                    // A row selects a commit, so it carries button semantics.
                    // It cannot be a <button>: rows contain links (autolinked
                    // issue references), and nesting those is invalid HTML.
                    // Arrow-key navigation is handled once at the window level.
                    role="button"
                    tabIndex={-1}
                    aria-pressed={isSelected}
                    className={`commit-row ${isSelected ? "selected" : ""}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => selectCommit(commit.oid)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectCommit(commit.oid);
                      }
                    }}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("text/plain")) {
                        e.preventDefault();
                        e.currentTarget.classList.add("drag-hover");
                      }
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove("drag-hover");
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("drag-hover");
                      const draggedBranch =
                        e.dataTransfer.getData("text/plain");
                      if (draggedBranch) {
                        handleDropOnCommit(draggedBranch, commit.oid);
                      }
                    }}
                  >
                    <div
                      className="commit-col-graph"
                      style={{ width: GRAPH_WIDTH }}
                    />
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className="commit-col-cell"
                        style={{ width: `${cell.column.getSize()}px` }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    ))}
                  </div>
                </ContextMenu.Trigger>

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
                    {remotes?.[0]?.url &&
                      getCommitUrl(remotes[0].url, commit.oid) && (
                        <ContextMenu.Item
                          className="context-menu-item"
                          onSelect={() => {
                            if (remotes[0]?.url) {
                              const url = getCommitUrl(
                                remotes[0].url,
                                commit.oid,
                              );
                              if (url) window.open(url, "_blank");
                            }
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
                        startComparison(commit.oid, "HEAD").then(() =>
                          setActiveView("compare"),
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
                          startComparison(selectedCommitOid, commit.oid).then(
                            () => setActiveView("compare"),
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
              </ContextMenu.Root>
            );
          })}
        </div>
      </div>
    </div>
  );
}
