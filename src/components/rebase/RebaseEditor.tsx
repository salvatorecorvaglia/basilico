/* ═══════════════════════════════════════════════════════
   Basilico — RebaseEditor Component
   Visual interactive rebase tool with drag-and-drop
   ═══════════════════════════════════════════════════════ */

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Edit2,
  HelpCircle,
  Info,
  Menu,
  Play,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { RebaseStatus, RebaseTodoItem } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";
import "./RebaseEditor.css";

export function RebaseEditor() {
  const rebaseTodoItems = useRepoStore((s) => s.rebaseTodoItems);
  const rebaseStatus = useRepoStore((s) => s.rebaseStatus);
  const writeRebaseTodo = useRepoStore((s) => s.writeRebaseTodo);
  const startRebase = useRepoStore((s) => s.startRebase);
  const stepRebase = useRepoStore((s) => s.stepRebase);

  const addNotification = useUIStore((s) => s.addNotification);
  const openPrompt = useUIStore((s) => s.openPrompt);
  const openConfirm = useUIStore((s) => s.openConfirm);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // While planning, nothing has been written to the repository yet — the plan
  // is editable and the run controls do not apply.
  const isPlanning = rebaseStatus?.status === "planning";

  // If no rebase active
  if (!rebaseStatus || rebaseStatus.status === "none") {
    return (
      <div className="rebase-empty animate-fade-in">
        <HelpCircle size={48} strokeWidth={1} className="text-secondary" />
        <h3>No active rebase session</h3>
        <p>
          You can start an interactive rebase from the Command Palette
          (Ctrl+Shift+P) or by right-clicking a commit in the graph.
        </p>
      </div>
    );
  }

  const handleActionChange = (
    index: number,
    action: RebaseTodoItem["action"],
  ) => {
    const updated = [...rebaseTodoItems];
    updated[index] = { ...updated[index], action };
    writeRebaseTodo(updated);
  };

  const handleSummaryChange = (index: number, summary: string) => {
    const updated = [...rebaseTodoItems];
    updated[index] = { ...updated[index], summary };
    writeRebaseTodo(updated);
  };

  // Auto-squashing assistant (--autosquash)
  const handleAutosquash = () => {
    if (rebaseTodoItems.length === 0) return;

    const items = [...rebaseTodoItems];
    let count = 0;

    // Scan backwards to safely move items
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const lower = item.summary.toLowerCase();
      let targetQuery = "";
      let isFixup = false;

      if (lower.startsWith("fixup! ")) {
        targetQuery = item.summary.slice(7).trim();
        isFixup = true;
      } else if (lower.startsWith("squash! ")) {
        targetQuery = item.summary.slice(8).trim();
        isFixup = false;
      }

      if (targetQuery) {
        // Find matching target commit earlier in the list
        const targetIdx = items.findIndex(
          (cand, idx) =>
            idx < i &&
            (cand.summary.toLowerCase().includes(targetQuery.toLowerCase()) ||
              cand.oid.startsWith(targetQuery)),
        );

        if (targetIdx !== -1) {
          // Remove fixup/squash item from position i
          const [removed] = items.splice(i, 1);
          removed.action = isFixup ? "fixup" : "squash";
          // Insert directly after targetIdx
          items.splice(targetIdx + 1, 0, removed);
          count++;
        }
      }
    }

    if (count > 0) {
      writeRebaseTodo(items);
      addNotification({
        type: "success",
        message: `Autosquash reordered ${count} commit(s)`,
      });
    } else {
      addNotification({
        type: "info",
        message: "No fixup! or squash! commits found to reorder",
      });
    }
  };

  // Reordering functions
  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...rebaseTodoItems];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    writeRebaseTodo(updated);
  };

  const moveDown = (index: number) => {
    if (index === rebaseTodoItems.length - 1) return;
    const updated = [...rebaseTodoItems];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    writeRebaseTodo(updated);
  };

  // Drag and Drop
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    const updated = [...rebaseTodoItems];
    const [removed] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, removed);
    setDraggedIndex(null);
    writeRebaseTodo(updated);
  };

  const handleRebaseResult = (res: RebaseStatus) => {
    if (res.status === "finished") {
      addNotification({
        type: "success",
        message: "Interactive rebase completed!",
      });
    } else if (res.status === "conflict") {
      addNotification({
        type: "warning",
        message:
          "Conflicts detected! Resolve them in the staging area and click Continue.",
      });
    }
  };

  const handleStart = () => {
    const kept = rebaseTodoItems.filter((i) => i.action !== "drop");
    const dropped = rebaseTodoItems.length - kept.length;

    openConfirm({
      title: "Start interactive rebase?",
      message:
        `This rewrites ${kept.length} commit(s)` +
        (dropped > 0 ? ` and drops ${dropped}` : "") +
        `. Commits that have already been pushed will need a force push afterwards.`,
      confirmLabel: "Start rebase",
      cancelLabel: "Keep editing",
      isDanger: true,
      onConfirm: async () => {
        try {
          const res = await startRebase();
          handleRebaseResult(res);
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to start rebase: ${err}`,
          });
        }
      },
    });
  };

  // Step controls
  const handleStep = async (action: "continue" | "skip" | "abort") => {
    if (
      action === "continue" &&
      rebaseStatus?.status === "reword" &&
      rebaseStatus.currentOid
    ) {
      const currentTodoItem = rebaseTodoItems.find(
        (item) => item.oid === rebaseStatus.currentOid,
      );
      const originalMessage = currentTodoItem?.summary || "";

      openPrompt({
        title: "Reword Commit Message",
        description: "Edit commit message for reword:",
        fields: [
          {
            name: "message",
            label: "Commit Message",
            type: "textarea",
            defaultValue: originalMessage,
            required: true,
          },
        ],
        submitLabel: "Continue",
        onSubmit: async (values) => {
          const userMessage = (values.message || "").trim();
          try {
            const res = await stepRebase("continue", userMessage);
            handleRebaseResult(res);
          } catch (err) {
            addNotification({
              type: "error",
              message: `Rebase step failed: ${err}`,
            });
          }
        },
      });
      return;
    }

    try {
      const res = await stepRebase(action);
      handleRebaseResult(res);
    } catch (err) {
      addNotification({ type: "error", message: `Rebase step failed: ${err}` });
    }
  };

  return (
    <div className="rebase-editor animate-fade-in">
      <div className="rebase-header">
        <div className="rebase-header-left">
          <h2>Interactive Rebase</h2>
          <span className="badge-rebase-state">{rebaseStatus.status}</span>
        </div>

        <div className="rebase-controls">
          {rebaseStatus.status === "conflict" && (
            <div className="rebase-conflict-warning">
              <AlertTriangle size={14} />
              <span>Resolve conflicts in Staging before continuing</span>
            </div>
          )}
          {rebaseStatus.status === "edit" && (
            <div className="rebase-info-banner">
              <Info size={14} />
              <span>Edit files, stage, then click Continue</span>
            </div>
          )}
          {rebaseStatus.status === "reword" && (
            <div className="rebase-info-banner">
              <Info size={14} />
              <span>Click Continue to reword commit</span>
            </div>
          )}
          {isPlanning ? (
            <>
              <button
                type="button"
                className="rebase-btn btn-skip"
                onClick={handleAutosquash}
                title="Reorder fixup! and squash! commits onto their targets"
              >
                <Sparkles size={12} />
                <span>Autosquash</span>
              </button>
              <button
                type="button"
                className="rebase-btn btn-continue"
                onClick={handleStart}
                title="Apply this plan to the repository"
              >
                <Play size={12} />
                <span>Start Rebase</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rebase-btn btn-continue"
                onClick={() => handleStep("continue")}
                title="Continue after resolving conflicts or finishing an edit"
              >
                <Play size={12} />
                <span>Continue</span>
              </button>
              <button
                type="button"
                className="rebase-btn btn-skip"
                onClick={() => handleStep("skip")}
                title="Skip current commit and continue"
              >
                <XCircle size={12} />
                <span>Skip</span>
              </button>
              <button
                type="button"
                className="rebase-btn btn-abort"
                onClick={() => handleStep("abort")}
                title="Abort rebase and return to original HEAD"
              >
                <Trash2 size={12} />
                <span>Abort</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rebase-todo-list custom-scrollbar">
        <div className="rebase-list-header">
          <span className="col-drag"></span>
          <span className="col-action">Action</span>
          <span className="col-oid">Commit</span>
          <span className="col-summary">Message</span>
          <span className="col-reorder">Reorder</span>
        </div>

        <div className="rebase-list-body">
          {rebaseTodoItems.map((item, index) => {
            const isCurrent = rebaseStatus.currentOid === item.oid;
            const canEditInline =
              item.action === "reword" || item.action === "squash";

            return (
              <div
                key={item.oid}
                draggable={isPlanning}
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                className={`rebase-row ${isCurrent ? "current" : ""} $draggedIndex === index ? "dragging" : ""$isPlanning ? "" : "rebase-row--locked"`}
              >
                <div
                  className="col-drag drag-handle"
                  title={
                    isPlanning
                      ? "Drag to reorder"
                      : "The plan is locked once the rebase is running"
                  }
                >
                  <Menu size={14} />
                </div>

                <div className="col-action">
                  <select
                    value={item.action}
                    // Once git is executing the todo, changing it here would
                    // have no effect on what actually runs.
                    disabled={!isPlanning}
                    aria-label={`Action for commit ${item.oid.slice(0, 7)}`}
                    onChange={(e) =>
                      handleActionChange(
                        index,
                        e.target.value as RebaseTodoItem["action"],
                      )
                    }
                  >
                    <option value="pick">pick (use commit)</option>
                    <option value="reword">reword (edit message)</option>
                    <option value="edit">edit (stop to edit files)</option>
                    <option value="squash">squash (meld into previous)</option>
                    <option value="fixup">fixup (squash discard log)</option>
                    <option value="drop">drop (discard commit)</option>
                  </select>
                </div>

                <div className="col-oid text-mono text-secondary">
                  {item.oid.slice(0, 7)}
                </div>

                <div className="col-summary truncate">
                  {isCurrent && (
                    <span className="current-marker">Applying ▸</span>
                  )}
                  {canEditInline ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Edit2 size={12} className="text-secondary" />
                      <input
                        type="text"
                        className="settings-input"
                        style={{ height: "24px", fontSize: "12px", flex: 1 }}
                        value={item.summary}
                        disabled={!isPlanning}
                        aria-label={`Message for commit ${item.oid.slice(0, 7)}`}
                        onChange={(e) =>
                          handleSummaryChange(index, e.target.value)
                        }
                      />
                    </div>
                  ) : (
                    <span
                      className={
                        item.action === "drop"
                          ? "text-strike text-tertiary"
                          : "text-primary"
                      }
                    >
                      {item.summary}
                    </span>
                  )}
                </div>

                <div className="col-reorder">
                  <button
                    type="button"
                    disabled={!isPlanning || index === 0}
                    onClick={() => moveUp(index)}
                    title="Move Up"
                    aria-label={`Move commit $item.oid.slice(0, 7)earlier`}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={
                      !isPlanning || index === rebaseTodoItems.length - 1
                    }
                    onClick={() => moveDown(index)}
                    title="Move Down"
                    aria-label={`Move commit $item.oid.slice(0, 7)later`}
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
