import { useCallback } from "react";
import { useUIStore } from "../store/ui-store";

interface RunGitActionOptions<T> {
  /**
   * Shown as a success toast. A string covers the common case; a function
   * receives the resolved value so the message can depend on it (e.g. a
   * merge that resolved cleanly vs. one that produced conflicts) — return
   * `null` from it to skip the success toast entirely, for callers that
   * raise their own notification (a warning instead of a success, say).
   */
  successMessage?: string | ((result: T) => string | null);
  /** Prefixed to the caught error: `"${errorPrefix}: ${err}"`. */
  errorPrefix: string;
}

/**
 * Runs a store action and turns its outcome into a toast, so call sites
 * don't each hand-roll the same `try { await x(); notify(success) } catch {
 * notify(error) }` triple. This was ~400 duplicated lines across the six
 * sidebar trees (BranchTree, RemoteTree, TagTree, StashTree, WorktreeTree,
 * SubmoduleTree) before being pulled out here.
 *
 * Returns the resolved value (or `undefined` on failure) in case a caller
 * needs it beyond the notification — e.g. to chain a follow-up action only
 * on success.
 */
export function useGitAction() {
  const addNotification = useUIStore((s) => s.addNotification);

  return useCallback(
    async <T>(
      action: () => Promise<T>,
      { successMessage, errorPrefix }: RunGitActionOptions<T>,
    ): Promise<T | undefined> => {
      try {
        const result = await action();
        const message =
          typeof successMessage === "function"
            ? successMessage(result)
            : successMessage;
        if (message) {
          addNotification({ type: "success", message });
        }
        return result;
      } catch (err) {
        addNotification({
          type: "error",
          message: `${errorPrefix}: ${err}`,
        });
        return undefined;
      }
    },
    [addNotification],
  );
}
