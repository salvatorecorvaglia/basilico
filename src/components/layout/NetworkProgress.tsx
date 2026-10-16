/* ═══════════════════════════════════════════════════════
   Basilico — Network Progress
   Live progress and cancel for clone, fetch, pull and push
   ═══════════════════════════════════════════════════════ */

import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cancelNetworkOperation } from "../../lib/tauri-commands";
import { useRepoStore } from "../../store/repo-store";
import "./NetworkProgress.css";

/** One `git:progress` event from the backend (see `git/progress.rs`). */
export interface NetworkProgressEvent {
  key: string;
  operation: "clone" | "fetch" | "pull" | "push" | string;
  phase: "receiving" | "resolving" | "uploading" | string;
  current: number;
  total: number;
  bytes: number;
  done: boolean;
}

const OPERATION_LABEL: Record<string, string> = {
  clone: "Cloning",
  fetch: "Fetching",
  pull: "Pulling",
  push: "Pushing",
};

const PHASE_LABEL: Record<string, string> = {
  receiving: "Receiving objects",
  resolving: "Resolving deltas",
  uploading: "Uploading objects",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Clone, fetch, pull and push used to show only a spinner — nothing about how
 * far a large clone had got — and could not be stopped. This lists every
 * running network operation with its progress and a Cancel button. Rendered
 * at the app root, so a clone started from the welcome screen shows too.
 */
export function NetworkProgress() {
  const [operations, setOperations] = useState<
    Record<string, NetworkProgressEvent>
  >({});
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({});
  const tabs = useRepoStore((s) => s.tabs);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    listen<NetworkProgressEvent>("git:progress", (event) => {
      const payload = event.payload;
      setOperations((current) => {
        const next = { ...current };
        if (payload.done) {
          delete next[payload.key];
        } else {
          next[payload.key] = payload;
        }
        return next;
      });
      if (payload.done) {
        setCancelling((current) => {
          const next = { ...current };
          delete next[payload.key];
          return next;
        });
      }
    }).then((unsub) => {
      if (active) unsubscribe = unsub;
      else unsub();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const running = Object.values(operations);
  if (running.length === 0) return null;

  const nameFor = (key: string) =>
    tabs.find((t) => t.id === key)?.name ??
    key.split(/[\\/]/).filter(Boolean).pop() ??
    key;

  const handleCancel = (key: string) => {
    setCancelling((current) => ({ ...current, [key]: true }));
    cancelNetworkOperation(key, { silent: true }).catch(() => {
      setCancelling((current) => ({ ...current, [key]: false }));
    });
  };

  return (
    <div className="network-progress" role="status" aria-live="polite">
      {running.map((op) => {
        const percent =
          op.total > 0
            ? Math.min(100, Math.round((op.current / op.total) * 100))
            : null;
        return (
          <div className="network-progress-item" key={op.key}>
            <div className="network-progress-header">
              <span className="network-progress-title">
                {OPERATION_LABEL[op.operation] ?? op.operation}{" "}
                {nameFor(op.key)}
              </span>
              <button
                type="button"
                className="network-progress-cancel"
                onClick={() => handleCancel(op.key)}
                disabled={cancelling[op.key]}
                aria-label={`Cancel ${op.operation} of ${nameFor(op.key)}`}
                title="Cancel"
              >
                <X size={12} />
              </button>
            </div>
            <div className="network-progress-detail">
              {cancelling[op.key]
                ? "Cancelling…"
                : `${PHASE_LABEL[op.phase] ?? "Connecting"}${
                    percent === null ? "" : ` ${percent}%`
                  }${op.bytes > 0 ? ` · ${formatBytes(op.bytes)}` : ""}`}
            </div>
            <div
              className="network-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              aria-label={`${op.operation} progress`}
            >
              <div
                className={`network-progress-fill ${percent === null ? "indeterminate" : ""}`}
                style={{ width: `${percent ?? 30}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
