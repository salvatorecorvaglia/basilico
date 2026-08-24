import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { GitDoctorModal } from "../../../src/components/settings/GitDoctorModal";
import type {
  DanglingCommitInfo,
  DoctorReport,
} from "../../../src/lib/git-types";
import { useRepoStore } from "../../../src/store/repo-store";
import { useUIStore } from "../../../src/store/ui-store";

const HEALTH: DoctorReport = {
  totalSizeBytes: 1000,
  gitSizeBytes: 500,
  looseObjectsCount: 3,
  packfilesCount: 1,
  lfsObjectsCount: 0,
};

const DANGLING: DanglingCommitInfo = {
  oid: "abc123",
  shortOid: "abc123",
  message: "lost work",
  authorName: "Author",
  date: 0,
  actionSubject: "commit",
};

describe("GitDoctorModal", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useRepoStore.setState({ activeTabId: "/repo" });
    useUIStore.setState({ promptOptions: null });
  });

  it("restores a dangling commit by creating the branch, closing the modal, then refreshing — in that order", async () => {
    const user = userEvent.setup();
    const order: string[] = [];

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_repo_health") return Promise.resolve(HEALTH);
      if (cmd === "find_dangling_commits") return Promise.resolve([DANGLING]);
      if (cmd === "create_branch") {
        order.push("create_branch");
        return Promise.resolve(undefined);
      }
      if (cmd === "get_status") {
        order.push("refresh");
        return Promise.resolve({
          branch: "main",
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          untracked: [],
          conflicted: [],
          state: "Clean",
        });
      }
      return Promise.resolve([]);
    });

    const onOpenChange = vi.fn((v: boolean) => {
      if (v === false) order.push("close");
    });

    render(<GitDoctorModal open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText("Restore to Branch")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Restore to Branch"));

    const promptOptions = useUIStore.getState().promptOptions;
    expect(promptOptions).not.toBeNull();

    await promptOptions?.onSubmit({ branchName: "recovered-abc123" });

    expect(order).toEqual(["create_branch", "close", "refresh"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
