/* ═══════════════════════════════════════════════════════
   Basilico — TagTree Component
   Tag tree section with create/delete/push context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Globe, Plus, Tag, Trash } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { TagInfo } from "../../lib/git-types";
import { useGitAction } from "../../lib/use-git-action";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface TagTreeProps {
  tags: TagInfo[];
}

export function useTagTree({ tags }: TagTreeProps) {
  const { checkoutBranch, deleteTag, createTag, pushTag, selectedCommitOid } =
    useRepoStore(
      useShallow((s) => ({
        checkoutBranch: s.checkoutBranch,
        deleteTag: s.deleteTag,
        createTag: s.createTag,
        pushTag: s.pushTag,
        selectedCommitOid: s.selectedCommitOid,
      })),
    );
  const { openPrompt, openConfirm } = useUIStore(
    useShallow((s) => ({
      openPrompt: s.openPrompt,
      openConfirm: s.openConfirm,
    })),
  );
  const runGitAction = useGitAction();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const handleCheckoutTag = (name: string) =>
    runGitAction(() => checkoutBranch(`refs/tags/${name}`), {
      successMessage: `Checked out tag "${name}" (detached HEAD)`,
      errorPrefix: "Failed to checkout tag",
    });

  const handleCreateTagPrompt = () => {
    openPrompt({
      title: "Create Tag",
      description:
        "Create a new lightweight or annotated tag at the selected commit.",
      fields: [
        {
          name: "name",
          label: "Tag Name",
          placeholder: "e.g. v1.0.0",
          required: true,
        },
        {
          name: "message",
          label: "Tag Message (optional)",
          placeholder: "e.g. Release version 1.0.0",
          type: "textarea",
        },
      ],
      submitLabel: "Create Tag",
      onSubmit: async (values) => {
        const name = values.name.trim();
        const msg = values.message.trim();
        const target = selectedCommitOid || "HEAD";
        await runGitAction(() => createTag(name, target, msg || null), {
          successMessage: `Created tag "${name}" at ${target.slice(0, 7)}`,
          errorPrefix: "Failed to create tag",
        });
      },
    });
  };

  const handleDeleteTag = (name: string) => {
    openConfirm({
      title: "Delete Tag",
      message: `Are you sure you want to delete tag "${name}"?`,
      confirmLabel: "Delete Tag",
      isDanger: true,
      onConfirm: () =>
        runGitAction(() => deleteTag(name), {
          successMessage: `Deleted tag "${name}"`,
          errorPrefix: "Failed to delete tag",
        }),
    });
  };

  const handlePushTag = (name: string) =>
    runGitAction(() => pushTag("origin", name), {
      successMessage: `Successfully pushed tag "${name}" to remote`,
      errorPrefix: "Failed to push tag",
    });

  return {
    count: tags.length,
    icon: <Tag size={13} />,
    action: (
      <button
        type="button"
        className="sidebar-header-btn"
        onClick={handleCreateTagPrompt}
        title="Create new tag"
      >
        <Plus size={13} />
      </button>
    ),
    content: tags.map((tag) => (
      <ContextMenu.Root key={tag.name}>
        <ContextMenu.Trigger>
          <button
            type="button"
            className={`sidebar-item ${selectedTag === tag.name ? "selected" : ""}`}
            onClick={() => setSelectedTag(tag.name)}
            onDoubleClick={() => handleCheckoutTag(tag.name)}
            title={tag.message || tag.name}
            aria-pressed={selectedTag === tag.name}
          >
            <Tag size={11} className="sidebar-item-tag-icon" />
            <span className="sidebar-item-name truncate">{tag.name}</span>
            {tag.isAnnotated && (
              <span className="sidebar-badge annotated">A</span>
            )}
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="radix-context-menu">
            <ContextMenu.Item
              className="context-menu-item"
              onSelect={() => handleCheckoutTag(tag.name)}
            >
              <Tag size={12} />
              <span>Checkout Tag</span>
            </ContextMenu.Item>
            <ContextMenu.Item
              className="context-menu-item"
              onSelect={() => handlePushTag(tag.name)}
            >
              <Globe size={12} />
              <span>Push Tag to Remote</span>
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-divider" />
            <ContextMenu.Item
              className="context-menu-item danger"
              onSelect={() => handleDeleteTag(tag.name)}
            >
              <Trash size={12} />
              <span>Delete Tag</span>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    )),
  };
}
