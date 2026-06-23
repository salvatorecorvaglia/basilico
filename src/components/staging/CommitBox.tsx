/* ═══════════════════════════════════════════════════════
   Basilico — CommitBox Component
   Commit message form with Amend support and Conventional hints
   ═══════════════════════════════════════════════════════ */

import { Check, Edit2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
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

export function CommitBox() {
  const { commits, status, commit, isLoading } = useRepoStore();
  const { addNotification } = useUIStore();
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [amend, setAmend] = useState(false);

  // Backup of user message before checking Amend
  const [userSummaryBackup, setUserSummaryBackup] = useState("");
  const [userDescriptionBackup, setUserDescriptionBackup] = useState("");

  const handleAmendToggle = (checked: boolean) => {
    setAmend(checked);
    if (checked) {
      // Backup current text
      setUserSummaryBackup(summary);
      setUserDescriptionBackup(description);

      // Populate with last commit
      const lastCommit = commits[0];
      if (lastCommit) {
        const lines = lastCommit.message.split("\n");
        const title = lines[0] || "";
        const body = lines.slice(1).join("\n").trim();
        setSummary(title);
        setDescription(body);
      }
    } else {
      // Restore user text
      setSummary(userSummaryBackup);
      setDescription(userDescriptionBackup);
    }
  };

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;

    const fullMessage = description.trim()
      ? `${summary.trim()}\n\n${description.trim()}`
      : summary.trim();

    try {
      await commit(fullMessage, amend);
      setSummary("");
      setDescription("");
      setAmend(false);
      setUserSummaryBackup("");
      setUserDescriptionBackup("");
    } catch (err) {
      addNotification({ type: "error", message: `Failed to commit: ${err}` });
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
    summary.trim().length > 0 && (hasStaged || amend) && !isLoading;

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
          disabled={isLoading}
          maxLength={72}
          required
        />
        <textarea
          className="commit-desc-input"
          placeholder="Add an optional extended description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
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
            disabled={isLoading || commits.length === 0}
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
