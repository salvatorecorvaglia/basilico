/* ═══════════════════════════════════════════════════════
   Basilico — TagTree Component
   Tag tree section with create/delete/push context menus
   ═══════════════════════════════════════════════════════ */

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Globe, Plus, Tag, Trash } from "lucide-react";
import { useState } from "react";
import type { TagInfo } from "../../lib/git-types";
import { useRepoStore } from "../../store/repo-store";
import { useUIStore } from "../../store/ui-store";

interface TagTreeProps {
  tags: TagInfo[];
}

export function TagTree({ tags }: TagTreeProps) {
  const { checkoutBranch, deleteTag, createTag, pushTag, selectedCommitOid } =
    useRepoStore();
  const { addNotification, openPrompt, openConfirm } = useUIStore();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const handleCheckoutTag = async (name: string) => {
    try {
      await checkoutBranch(`refs/tags/${name}`);
      addNotification({
        type: "success",
        message: `Checked out tag "${name}" (detached HEAD)`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to checkout tag: ${err}`,
      });
    }
  };

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
        try {
          await createTag(name, target, msg || null);
          addNotification({
            type: "success",
            message: `Created tag "${name}" at ${target.slice(0, 7)}`,
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

  const handleDeleteTag = (name: string) => {
    openConfirm({
      title: "Delete Tag",
      message: `Are you sure you want to delete tag "${name}"?`,
      confirmLabel: "Delete Tag",
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteTag(name);
          addNotification({
            type: "success",
            message: `Deleted tag "${name}"`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            message: `Failed to delete tag: ${err}`,
          });
        }
      },
    });
  };

  const handlePushTag = async (name: string) => {
    try {
      await pushTag("origin", name);
      addNotification({
        type: "success",
        message: `Successfully pushed tag "${name}" to remote`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: `Failed to push tag: ${err}`,
      });
    }
  };

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
