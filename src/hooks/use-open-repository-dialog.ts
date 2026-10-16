import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useRepoStore } from "../store/repo-store";

/**
 * Ask for a folder and open it as a repository.
 *
 * Shared by the global Cmd/Ctrl+O shortcut and the toolbar's repository menu,
 * which each carried a copy of this handler.
 */
export function useOpenRepositoryDialog(): () => Promise<void> {
  const openRepository = useRepoStore((s) => s.openRepository);

  return useCallback(async () => {
    // `openRepository` raises its own toast and then rethrows, so without this
    // catch every failed open also surfaced as an unhandled rejection — and
    // the shortcut path calls this from a keydown listener that cannot await.
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Git Repository",
      });
      if (selected) {
        await openRepository(selected as string);
      }
    } catch (err) {
      console.error("Failed to open repository:", err);
    }
  }, [openRepository]);
}
