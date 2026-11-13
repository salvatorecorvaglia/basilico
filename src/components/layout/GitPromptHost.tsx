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
    const pending = new Map<string, GitPromptRequest>();
    let displayed: string | null = null;
    const closeOwn = (id: string) => {
      const ui = useUIStore.getState();
      if (displayed === id) displayed = null;
      if (ui.promptOptions?.requestId === id) ui.closePrompt();
      if (ui.confirmOptions?.requestId === id) ui.closeConfirm();
    };
    const reply = (id: string, answer: GitPromptAnswer | null) => {
      pending.delete(id);
      answerGitPrompt(id, answer, { silent: true }).catch((err) =>
        console.error("Failed to answer git prompt:", err),
      );
      closeOwn(id);
    };
    const pump = () => {
      if (!active) return;
      const ui = useUIStore.getState();
      if (
        displayed &&
        ui.promptOptions?.requestId !== displayed &&
        ui.confirmOptions?.requestId !== displayed
      ) {
        const displaced = displayed;
        displayed = null;
        pending.delete(displaced);
        answerGitPrompt(displaced, null, { silent: true }).catch(console.error);
      }
      if (ui.promptOptions || ui.confirmOptions || displayed) return;
      const request = pending.values().next().value;
      if (!request) return;
      displayed = request.id;
      if (request.kind === "credentials") {
        ui.openPrompt({
          requestId: request.id,
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
          requestId: request.id,
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
    };
    const unsubscribeUI = useUIStore.subscribe(pump);
    const closed = new Set<string>();
    const listeners = [
      listen<string>("git:prompt-closed", ({ payload: id }) => {
        if (!active) return;
        closed.add(id);
        if (closed.size > 256)
          closed.delete(closed.values().next().value as string);
        pending.delete(id);
        closeOwn(id);
        pump();
      }),
      listen<GitPromptRequest>("git:prompt", ({ payload: request }) => {
        if (!active || closed.has(request.id)) return;
        pending.set(request.id, request);
        pump();
      }),
    ];
    const unsubs: (() => void)[] = [];
    for (const listener of listeners)
      listener
        .then((unsub) => {
          if (active) unsubs.push(unsub);
          else unsub();
        })
        .catch((err) =>
          console.error("Could not listen for Git prompts:", err),
        );
    return () => {
      active = false;
      unsubscribeUI();
      for (const id of pending.keys()) reply(id, null);
      for (const unsubscribe of unsubs) unsubscribe();
    };
  }, []);

  return null;
}
