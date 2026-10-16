/* ═══════════════════════════════════════════════════════
   Basilico — Git Prompt Host
   Answers the questions a running network operation asks
   ═══════════════════════════════════════════════════════ */

import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import {
  answerGitPrompt,
  type GitPromptAnswer,
  type GitPromptRequest,
} from "../../lib/tauri-commands";
import { useUIStore } from "../../store/ui-store";

/**
 * A clone, fetch, pull or push can need something only the user can give:
 * HTTPS credentials that no helper or stored token supplied, or a decision to
 * trust an SSH host seen for the first time. The operation waits on its own
 * thread while this shows the question through the app's prompt and confirm
 * dialogs, then sends the answer back. Before this, the first case failed
 * with "no credentials available" and the second was left to libgit2.
 */
export function GitPromptHost() {
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    const reply = (id: string, answer: GitPromptAnswer | null) => {
      answerGitPrompt(id, answer, { silent: true }).catch((err) =>
        console.error("Failed to answer git prompt:", err),
      );
    };

    listen<GitPromptRequest>("git:prompt", (event) => {
      const request = event.payload;
      const ui = useUIStore.getState();

      if (request.kind === "credentials") {
        ui.openPrompt({
          title: "Sign in to remote",
          description: request.retry
            ? `The remote rejected those credentials. Try again for ${request.url}.`
            : `Basilico needs credentials for ${request.url}. For GitHub, use a personal access token as the password.`,
          fields: [
            {
              name: "username",
              label: "Username",
              defaultValue: request.username ?? "",
              required: true,
            },
            {
              name: "password",
              label: "Password or token",
              type: "password",
              required: true,
            },
          ],
          submitLabel: "Sign in",
          onSubmit: (values) =>
            reply(request.id, {
              username: values.username ?? "",
              password: values.password ?? "",
            }),
          onCancel: () => reply(request.id, null),
        });
      } else if (request.kind === "hostKey") {
        ui.openConfirm({
          title: "Unknown SSH host",
          message:
            `Basilico has not connected to ${request.host} from this computer before. ` +
            `Its ${request.keyType} key fingerprint is ${request.fingerprint}. ` +
            "Only trust it if this matches the fingerprint the host publishes. " +
            "Trusting adds the key to ~/.ssh/known_hosts.",
          confirmLabel: "Trust and connect",
          cancelLabel: "Don't connect",
          onConfirm: () => reply(request.id, { accept: true }),
          onCancel: () => reply(request.id, { accept: false }),
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

  return null;
}
