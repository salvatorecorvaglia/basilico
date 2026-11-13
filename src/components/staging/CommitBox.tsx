/* ═══════════════════════════════════════════════════════
   Basilico — CommitBox Component
   Commit message form with Amend support and Conventional hints
   ═══════════════════════════════════════════════════════ */

import { Check, Edit2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { reportError } from "../../lib/git-error";
import * as commands from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import "./CommitBox.css";

const CONVENTIONAL_TYPES = [
  { label: "feat", desc: "New feature" },
  { label: "fix", desc: "Bug fix" },
  { label: "docs", desc: "Documentation" },
  { label: "style", desc: "Formatting, missing semi colons" },
  { label: "refactor", desc: "Code refactoring" },
  { label: "test", desc: "Adding missing tests" },
  { label: "chore", desc: "Maintain" },
];

interface CommitMessageParts {
  title: string;
  body: string;
}

function splitMessage(message: string): CommitMessageParts {
  const lines = message.split("\n");
  return { title: lines[0] || "", body: lines.slice(1).join("\n").trim() };
}

export function CommitBox() {
  const path = useRepoStore((s) => s.activeTabId);
  return path ? <RepositoryCommitBox key={path} path={path} /> : null;
}

function RepositoryCommitBox({ path }: { path: string }) {
  const { activeTabId, status, commit, isLoading } = useRepoStore(
    useShallow((s) => ({
      activeTabId: s.activeTabId,
      status: s.status,
      commit: s.commit,
      isLoading: s.isLoading,
    })),
  );
  const isEmpty = useRepoStore((s) => s.repoInfo?.isEmpty === true);
  const draft = useRepoStore.getState().commitDrafts[path];
  const [summary, setSummary] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.body ?? "");
  const [amendOid, setAmendOid] = useState<string | null>(null);
  const [amendLoading, setAmendLoading] = useState(false);
  const [amend, setAmend] = useState(false);

  // Backup of user message before checking Amend
  const [userSummaryBackup, setUserSummaryBackup] = useState("");
  const [userDescriptionBackup, setUserDescriptionBackup] = useState("");

  // The message the form was pre-filled with for amending, to tell whether the
  // user has edited it since.
  const [amendTemplate, setAmendTemplate] = useState<CommitMessageParts | null>(
    null,
  );
  // Bumped on every toggle so a slow message lookup can't land after the user
  // has already unticked Amend.
  const amendRequest = useRef(0);

  useEffect(() => {
    if (!amend)
      useRepoStore.setState((s) => ({
        commitDrafts: {
          ...s.commitDrafts,
          [path]: { title: summary, body: description },
        },
      }));
  }, [path, summary, description, amend]);
  useEffect(
    () => () => {
      amendRequest.current++;
    },
    [],
  );

  const handleAmendToggle = (checked: boolean) => {
    setAmend(checked);
    setAmendOid(null);
    const ticket = ++amendRequest.current;
    if (checked) {
      setUserSummaryBackup(summary);
      setUserDescriptionBackup(description);
      setAmendLoading(true);
      commands
        .getAmendCommit(path, { silent: true })
        .then(({ oid, message }) => {
          if (ticket !== amendRequest.current) return;
          const full = splitMessage(message);
          setSummary(full.title);
          setDescription(full.body);
          setAmendTemplate(full);
          setAmendOid(oid);
        })
        .catch((err) => {
          if (ticket !== amendRequest.current) return;
          reportError(
            err,
            "Could not load HEAD for Amend. Toggle Amend to retry.",
          );
        })
        .finally(() => {
          if (ticket === amendRequest.current) setAmendLoading(false);
        });
    } else {
      setAmendLoading(false);
      const hasEdited =
        amendTemplate !== null &&
        (summary !== amendTemplate.title || description !== amendTemplate.body);
      setAmendTemplate(null);

      if (!hasEdited) {
        // Restore user text only if the amend message was not modified
        setSummary(userSummaryBackup);
        setDescription(userDescriptionBackup);
      }
    }
  };

  const performCommit = async () => {
    if (!canCommit || activeTabId !== path) return;

    const fullMessage = description.trim()
      ? `${summary.trim()}\n\n${description.trim()}`
      : summary.trim();

    try {
      if (amend) await commit(fullMessage, true, amendOid ?? undefined);
      else await commit(fullMessage, false);
      setSummary("");
      setDescription("");
      setAmend(false);
      setAmendTemplate(null);
      setUserSummaryBackup("");
      setUserDescriptionBackup("");
    } catch (err) {
      reportError(err, "Failed to commit");
    }
  };

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performCommit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canCommit) {
        performCommit();
      }
    }
  };

  const handlePrefixClick = (prefix: string) => {
    const cleanSummary = summary.replace(
      /^(feat|fix|docs|style|refactor|test|chore)(\(.*\))?:?\s*/i,
      "",
    );
    setSummary(`${prefix}: ${cleanSummary}`);
  };

  const hasStaged = status ? status.staged.length > 0 : false;
  const canCommit =
    summary.trim().length > 0 &&
    (hasStaged || amend) &&
    !isLoading &&
    !amendLoading &&
    (!amend || amendOid !== null);

  return (
    <form className="commit-box" onSubmit={handleCommitSubmit}>
      {/* Conventional prefixes */}
      <div className="commit-conventional">
        <span className="text-tertiary">Prefix:</span>
        {CONVENTIONAL_TYPES.map((type) => (
          <button
            key={type.label}
            type="button"
            className="conventional-btn"
            disabled={isLoading || amendLoading}
            onClick={() => handlePrefixClick(type.label)}
            title={type.desc}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Input Fields */}
      <div className="commit-inputs">
        <input
          type="text"
          className="commit-summary-input"
          placeholder="Commit title (e.g. feat: add login button)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || amendLoading}
          maxLength={72}
          required
        />
        <textarea
          className="commit-desc-input"
          placeholder="Add an optional extended description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || amendLoading}
          rows={3}
        />
      </div>

      {/* Action footer */}
      <div className="commit-footer">
        <label className="commit-amend-label">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => handleAmendToggle(e.target.checked)}
            disabled={isLoading || isEmpty}
          />
          <span>Amend last commit</span>
        </label>

        <button
          type="submit"
          className={`commit-submit-btn ${canCommit ? "active" : ""}`}
          disabled={!canCommit}
        >
          {isLoading ? (
            <span className="spinner-small" />
          ) : amend ? (
            <>
              <Edit2 size={14} />
              <span>Amend Commit</span>
            </>
          ) : (
            <>
              <Check size={14} />
              <span>Commit Changes ({status?.staged.length ?? 0})</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
