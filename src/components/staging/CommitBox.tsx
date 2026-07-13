/* ═══════════════════════════════════════════════════════
   Basilico — CommitBox Component
   Commit message form with Amend support and Conventional hints
   ═══════════════════════════════════════════════════════ */

import { Check, Edit2, Sparkles } from "lucide-react";
import type React from "react";
import { useState } from "react";
import * as commands from "../../lib/tauri-commands";
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
  const { commits, status, commit, isLoading, activeTabId, settings } =
    useRepoStore();
  const { addNotification } = useUIStore();
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [amend, setAmend] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);

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
      // Check if user edited the amend message
      const lastCommit = commits[0];
      let hasEdited = false;
      if (lastCommit) {
        const lines = lastCommit.message.split("\n");
        const title = lines[0] || "";
        const body = lines.slice(1).join("\n").trim();
        if (summary !== title || description !== body) {
          hasEdited = true;
        }
      }

      if (!hasEdited) {
        // Restore user text only if the amend message was not modified
        setSummary(userSummaryBackup);
        setDescription(userDescriptionBackup);
      }
    }
  };

  const performCommit = async () => {
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

  const handleGenerateAICommit = async () => {
    if (!activeTabId) return;

    setGeneratingAI(true);
    try {
      const diffs = await commands.getStagedDiff(activeTabId);
      if (!diffs || diffs.length === 0) {
        addNotification({
          type: "info",
          message: "No staged changes found",
          description:
            "Stage some files first before generating an AI commit message.",
        });
        setGeneratingAI(false);
        return;
      }

      let diffText = "";
      for (const f of diffs) {
        const filePath = f.newPath || f.oldPath || "unknown";
        diffText += `File: ${filePath}\n`;
        diffText += `Stats: +${f.stats.additions} -${f.stats.deletions}\n`;
        for (const hunk of f.hunks) {
          diffText += `Hunk: ${hunk.header}\n`;
          for (const line of hunk.lines) {
            if (line.origin === "+" || line.origin === "-") {
              diffText += `${line.origin} ${line.content}\n`;
            }
          }
        }
        diffText += "\n";
      }

      if (diffText.length > 5000) {
        diffText = `${diffText.substring(0, 5000)}\n...[truncated for size]`;
      }

      const apiKey = settings?.geminiApiKey;
      if (apiKey) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Generate a concise Conventional Commit message (feat: ..., fix: ..., docs: ..., etc.) for the following git diff. Output ONLY the title (max 72 chars) on the first line, followed by an optional description. Do not wrap in markdown code blocks.\n\n${diffText}`,
                    },
                  ],
                },
              ],
            }),
          },
        );

        if (!response.ok) {
          throw new Error(`Gemini API returned status ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error("Invalid response from Gemini API");
        }

        const lines = text.trim().split("\n");
        const title = lines[0] || "";
        const body = lines.slice(1).join("\n").trim();
        setSummary(title.substring(0, 72));
        setDescription(body);

        addNotification({
          type: "success",
          message: "Commit message generated by Gemini AI",
        });
      } else {
        const fileNames = diffs.map((f) =>
          (f.newPath || f.oldPath || "unknown").split("/").pop(),
        );
        const primaryFile = fileNames[0];
        const type = primaryFile?.endsWith(".md") ? "docs" : "feat";
        const fallbackTitle =
          fileNames.length === 1
            ? `${type}: update ${primaryFile}`
            : `${type}: update ${primaryFile} and ${fileNames.length - 1} other files`;

        setSummary(fallbackTitle.substring(0, 72));
        setDescription(
          "Autogenerated fallback message. Set your Gemini API key in settings for full AI descriptions.",
        );

        addNotification({
          type: "info",
          message: "Fallback commit summary generated",
          description:
            "Configure Google Gemini API Key in Settings to get full AI generation.",
        });
      }
    } catch (err) {
      addNotification({
        type: "error",
        message: "Failed to generate commit message",
        description: String(err),
      });
    } finally {
      setGeneratingAI(false);
    }
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

        <button
          type="button"
          className="conventional-btn ai-generate-btn"
          onClick={handleGenerateAICommit}
          disabled={generatingAI || isLoading}
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: "var(--accent-primary)",
            color: "var(--text-inverse)",
            borderColor: "var(--accent-primary)",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          <Sparkles size={11} />
          {generatingAI ? "Generating..." : "AI Generate"}
        </button>
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
          disabled={isLoading}
          maxLength={72}
          required
        />
        <textarea
          className="commit-desc-input"
          placeholder="Add an optional extended description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
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
