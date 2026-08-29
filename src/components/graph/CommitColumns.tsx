/* ═══════════════════════════════════════════════════════
   Basilico — Commit Table Columns
   Column definitions for the commit list's TanStack table
   ═══════════════════════════════════════════════════════ */

import {
  legacyCreateColumnHelper as createColumnHelper,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import { useMemo } from "react";
import { buildAutolinkSegments } from "../../lib/autolink";
import type { GraphCommit, RefLabel } from "../../lib/git-types";
import {
  formatRelativeTime,
  getInitials,
  openExternalUrl,
  stringToColor,
} from "../../lib/utils";

const columnHelper = createColumnHelper<GraphCommit>();

/** A branch, tag or HEAD label rendered beside a commit. */
export function RefBadge({ ref: refLabel }: { ref: RefLabel }) {
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

/**
 * Build the commit table's column definitions.
 *
 * Autolink settings are passed in rather than read from the store so this
 * stays a pure function of its inputs — and so the memo's dependencies are
 * exactly the two values the cells actually read.
 */
export function useCommitColumns(
  autolinkPattern: string | null | undefined,
  autolinkUrl: string | null | undefined,
  // biome-ignore lint/suspicious/noExplicitAny: invariant generic, see below
): LegacyColumnDef<GraphCommit, any>[] {
  // array cannot be typed with `unknown` — each accessor would have to match
  // exactly. `any` is the library's own idiom for this position; the accessors
  // below remain individually type-checked against GraphCommit.
  // biome-ignore lint/suspicious/noExplicitAny: invariant generic, see above
  return useMemo<LegacyColumnDef<GraphCommit, any>[]>(
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
            autolinkPattern,
            autolinkUrl,
          );

          return (
            <span className="commit-message truncate">
              {segments.map((segment, idx) => {
                const url = segment.url;
                if (!url) return segment.text;
                return (
                  <button
                    // Segments are positional; the index is the stable identity
                    // for a given message render.
                    key={`${idx}-${segment.text}`}
                    type="button"
                    className="autolink"
                    // Routed through `openExternalUrl` like every other outbound
                    // link in the app. A bare href skipped its https-only check,
                    // and the URL here is expanded from a user-supplied autolink
                    // template, so it is exactly the input that guard exists for.
                    onClick={(e) => {
                      e.stopPropagation();
                      openExternalUrl(url);
                    }}
                  >
                    {segment.text}
                  </button>
                );
              })}
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
    [autolinkPattern, autolinkUrl],
  );
}
