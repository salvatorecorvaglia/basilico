import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useRef } from "react";
import { useUIStore } from "../store/ui-store";

/**
 * Hook to automatically check for application updates, mirroring Lunar's updater style.
 * Mount this once at the app level.
 */
export function useUpdater(): void {
  const { addNotification, removeNotification } = useUIStore();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    // Hard-guard: only check for updates in production build to mimic Lunar's app.isPackaged check.
    // Vite sets import.meta.env.PROD to true in production builds.
    if (!import.meta.env.PROD) {
      console.log("[Updater] Skipping update check in development mode.");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        console.log("[Updater] Checking for updates...");
        const update = await check();

        if (update?.available) {
          console.log(`[Updater] Update v${update.version} is available.`);

          addNotification({
            type: "info",
            message: `Update v${update.version} available`,
            description: "A new version is ready to download.",
            timeout: 999999, // Keep toast open
            action: {
              label: "Download",
              onClick: async () => {
                // Show loading toast
                addNotification({
                  type: "info",
                  message: "Downloading update…",
                  description: "Initializing download...",
                  timeout: 999999,
                });

                try {
                  let downloaded = 0;
                  let contentLength = 0;

                  await update.downloadAndInstall((event) => {
                    switch (event.event) {
                      case "Started":
                        contentLength = event.data.contentLength ?? 0;
                        break;
                      case "Progress": {
                        downloaded += event.data.chunkLength;
                        const percent = contentLength
                          ? Math.round((downloaded / contentLength) * 100)
                          : 0;

                        // Find and update the progress notification
                        const progressToast = useUIStore
                          .getState()
                          .notifications.find((n) =>
                            n.message.startsWith("Downloading update…"),
                          );
                        if (progressToast) {
                          removeNotification(progressToast.id);
                        }
                        addNotification({
                          type: "info",
                          message: "Downloading update…",
                          description: `Downloading... ${percent}%`,
                          timeout: 999999,
                        });
                        break;
                      }
                      case "Finished":
                        break;
                    }
                  });

                  // Dismiss download progress
                  const progressToast = useUIStore
                    .getState()
                    .notifications.find((n) =>
                      n.message.startsWith("Downloading update…"),
                    );
                  if (progressToast) {
                    removeNotification(progressToast.id);
                  }

                  // Show success / restart toast
                  addNotification({
                    type: "success",
                    message: "Update downloaded",
                    description:
                      "Basilico will update when you restart the app.",
                    timeout: 999999,
                    action: {
                      label: "Restart now",
                      onClick: async () => {
                        try {
                          await relaunch();
                        } catch (err) {
                          console.error(
                            "[Updater] Failed to relaunch app:",
                            err,
                          );
                        }
                      },
                    },
                  });
                } catch (err: unknown) {
                  // Dismiss download progress
                  const progressToast = useUIStore
                    .getState()
                    .notifications.find((n) =>
                      n.message.startsWith("Downloading update…"),
                    );
                  if (progressToast) {
                    removeNotification(progressToast.id);
                  }

                  addNotification({
                    type: "error",
                    message: "Update failed",
                    description:
                      err instanceof Error ? err.message : String(err),
                    timeout: 10000,
                  });
                }
              },
            },
          });
        } else {
          console.log("[Updater] No updates available.");
        }
      } catch (err) {
        console.error("[Updater] Error checking for updates:", err);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [addNotification, removeNotification]);
}
