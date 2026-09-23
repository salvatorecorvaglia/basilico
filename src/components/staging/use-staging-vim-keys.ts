/* ═══════════════════════════════════════════════════════
   Basilico — Staging Vim Navigation
   j/k to move, s/u to stage/unstage, c to focus the message, g to the graph
   ═══════════════════════════════════════════════════════ */

import { useEffect } from "react";
import type { ActiveView, RepoStatus } from "../../lib/git-types";

interface StagingVimKeysOptions {
  enabled: boolean;
  status: RepoStatus | null;
  selectedFilePath: string | null;
  selectLocalFile: (path: string, isStaged: boolean) => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  setActiveView: (view: ActiveView) => void;
}

/**
 * Bind the staging list's vim-style keys to the window.
 *
 * Navigation order matches how the list reads top to bottom: unstaged, then
 * untracked, then staged.
 */
export function useStagingVimKeys({
  enabled,
  status,
  selectedFilePath,
  selectLocalFile,
  stageFiles,
  unstageFiles,
  setActiveView,
}: StagingVimKeysOptions): void {
  useEffect(() => {
    const handleVimKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest(".monaco-editor"));
      if (isInput || !enabled || !status) return;

      const { staged: st, unstaged: un, untracked: ut } = status;
      const allFiles = [
        ...un.map((f) => ({ path: f.path, isStaged: false })),
        ...ut.map((p) => ({ path: p, isStaged: false })),
        ...st.map((f) => ({ path: f.path, isStaged: true })),
      ];
      if (allFiles.length === 0) return;

      const currIdx = allFiles.findIndex((f) => f.path === selectedFilePath);

      // These store actions rethrow; a keydown listener cannot await them, so
      // each call needs its own catch or a failure becomes an unhandled
      // rejection the user never sees.
      const select = (file: { path: string; isStaged: boolean }) => {
        selectLocalFile(file.path, file.isStaged).catch((err) => {
          console.error("Failed to load diff for", file.path, err);
        });
      };

      if (e.key === "j") {
        e.preventDefault();
        const nextIdx = currIdx < allFiles.length - 1 ? currIdx + 1 : 0;
        select(allFiles[nextIdx]);
      } else if (e.key === "k") {
        e.preventDefault();
        const prevIdx = currIdx > 0 ? currIdx - 1 : allFiles.length - 1;
        select(allFiles[prevIdx]);
      } else if (e.key === "s") {
        e.preventDefault();
        if (selectedFilePath) {
          const fileObj = allFiles.find((f) => f.path === selectedFilePath);
          if (fileObj && !fileObj.isStaged) {
            stageFiles([selectedFilePath]).catch((err) => {
              console.error("Failed to stage", selectedFilePath, err);
            });
          }
        }
      } else if (e.key === "u") {
        e.preventDefault();
        if (selectedFilePath) {
          const fileObj = allFiles.find((f) => f.path === selectedFilePath);
          if (fileObj?.isStaged) {
            unstageFiles([selectedFilePath]).catch((err) => {
              console.error("Failed to unstage", selectedFilePath, err);
            });
          }
        }
      } else if (e.key === "c") {
        e.preventDefault();
        const msgBox = document.querySelector(
          ".commit-box-textarea",
        ) as HTMLTextAreaElement | null;
        msgBox?.focus();
      } else if (e.key === "g") {
        e.preventDefault();
        setActiveView("graph");
      }
    };

    window.addEventListener("keydown", handleVimKey);
    return () => window.removeEventListener("keydown", handleVimKey);
  }, [
    enabled,
    status,
    selectedFilePath,
    selectLocalFile,
    stageFiles,
    unstageFiles,
    setActiveView,
  ]);
}
