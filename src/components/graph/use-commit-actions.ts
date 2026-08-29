/* ═══════════════════════════════════════════════════════
   Basilico — Commit Actions
   Checkout, cherry-pick, revert, and the branch/tag prompts
   ═══════════════════════════════════════════════════════ */

import { useShallow } from "zustand/react/shallow";
import { validateTagName } from "../../lib/git-validation";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

/**
 * The commit context menu's write actions, each wrapping its store call in the
 * success/error toast pair the menu expects.
 *
 * Pulled out of `CommitList`, where five near-identical try/notify/catch
 * blocks made up an eighth of the component.
 */
export function useCommitActions() {
  const {
    checkoutBranch,
    createBranch,
    createTag,
    cherryPickCommit,
    revertCommit,
  } = useRepoStore(
    useShallow((s) => ({
      checkoutBranch: s.checkoutBranch,
      createBranch: s.createBranch,
      createTag: s.createTag,
      cherryPickCommit: s.cherryPickCommit,
      revertCommit: s.revertCommit,
    })),
  );

  const { addNotification, openPrompt } = useUIStore(
    useShallow((s) => ({
      addNotification: s.addNotification,
      openPrompt: s.openPrompt,
    })),
  );

  const handleCheckoutCommit = async (oid: string) => {
    try {
      await checkoutBranch(oid);
      addNotification({
        type: "success",
        message: `Checked out commit ${oid.slice(0, 7)} (detached HEAD)`,
      });
    } catch (err) {
      addNotification({ type: "error", message: `Checkout failed: ${err}` });
    }
  };

  const handleCherryPick = async (oid: string) => {
    try {
      const res = await cherryPickCommit(oid);
      if (res === "conflicts") {
        addNotification({
          type: "warning",
          message: `Cherry-pick conflict at commit ${oid.slice(0, 7)}. Please resolve conflicts in staging.`,
        });
      } else {
        addNotification({
          type: "success",
          message: `Successfully cherry-picked commit ${oid.slice(0, 7)}`,
        });
      }
    } catch (err) {
      addNotification({ type: "error", message: `Cherry-pick failed: ${err}` });
    }
  };

  const handleRevert = async (oid: string) => {
    try {
      const res = await revertCommit(oid);
      if (res === "conflicts") {
        addNotification({
          type: "warning",
          message: `Revert conflict at commit ${oid.slice(0, 7)}. Please resolve conflicts in staging.`,
        });
      } else {
        addNotification({
          type: "success",
          message: `Successfully reverted commit ${oid.slice(0, 7)}`,
        });
      }
    } catch (err) {
      addNotification({ type: "error", message: `Revert failed: ${err}` });
    }
  };

  const handleCreateBranchPrompt = (oid: string) => {
    openPrompt({
      title: "Create Branch",
      description: `Create a new branch at commit ${oid.slice(0, 7)}.`,
      fields: [
        {
          name: "name",
          label: "Branch Name",
          placeholder: "e.g. feature/checkout-fix",
          required: true,
        },
      ],
      submitLabel: "Create Branch",
      onSubmit: async (values) => {
        const name = values.name.trim();
        try {
          await createBranch(name, oid);
          addNotification({
            type: "success",
            message: `Created branch "${name}" at ${oid.slice(0, 7)}`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to create branch: ${err}`,
          });
        }
      },
    });
  };

  const handleCreateTagPrompt = (oid: string) => {
    openPrompt({
      title: "Create Tag",
      description: `Create a new tag at commit ${oid.slice(0, 7)}.`,
      fields: [
        {
          name: "name",
          label: "Tag Name",
          placeholder: "e.g. v1.1.2",
          required: true,
        },
        {
          name: "message",
          label: "Tag Message (optional)",
          placeholder: "e.g. Tag release at commit OID",
          type: "textarea",
        },
      ],
      submitLabel: "Create Tag",
      onSubmit: async (values) => {
        const name = values.name.trim();
        const message = values.message.trim();
        const validationError = validateTagName(name);
        if (validationError) {
          addNotification({ type: "error", message: validationError });
          return;
        }
        try {
          await createTag(name, oid, message || null);
          addNotification({
            type: "success",
            message: `Created tag "${name}" at ${oid.slice(0, 7)}`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to create tag: ${err}`,
          });
        }
      },
    });
  };

  return {
    handleCheckoutCommit,
    handleCherryPick,
    handleRevert,
    handleCreateBranchPrompt,
    handleCreateTagPrompt,
  };
}
