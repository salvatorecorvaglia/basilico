import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRepoStore } from "../../store/repo-store";
import { CommitList } from "../graph/CommitList";

vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useVirtualizer: ({ count }: { count: number }) => ({
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          key: i,
          start: i * 34,
          size: 34,
        })),
      getTotalSize: () => count * 34,
      scrollToIndex: vi.fn(),
    }),
  };
});

vi.mock("../../store/repo-store", () => ({
  useRepoStore: vi.fn(),
}));

vi.mock("../../store/ui-store", () => ({
  useUIStore: vi.fn(() => ({
    openResetModal: vi.fn(),
    openPrompt: vi.fn(),
    openConfirm: vi.fn(),
    addNotification: vi.fn(),
    setActiveView: vi.fn(),
  })),
}));

describe("CommitList", () => {
  it("renders empty state when no commits are present", () => {
    vi.mocked(useRepoStore).mockReturnValue({
      commits: [],
      selectedCommitOid: null,
      selectCommit: vi.fn(),
      loadingStates: { commits: false },
      loadMoreCommits: vi.fn(),
      cherryPickCommit: vi.fn(),
      revertCommit: vi.fn(),
      createBranch: vi.fn(),
      createTag: vi.fn(),
      checkoutBranch: vi.fn(),
    } as any);

    render(<CommitList />);
    expect(screen.getByText("No commits yet")).toBeDefined();
  });

  it("renders commit list with commit messages", () => {
    vi.mocked(useRepoStore).mockReturnValue({
      commits: [
        {
          oid: "abc123456789",
          shortOid: "abc1234",
          summary: "Initial commit",
          message: "Initial commit",
          authorName: "Salvatore",
          authorEmail: "salvatore@example.com",
          timestamp: Math.floor(Date.now() / 1000),
          parents: [],
          refs: [{ name: "main", kind: "LocalBranch" }],
          lane: 0,
        },
      ],
      selectedCommitOid: "abc123456789",
      selectCommit: vi.fn(),
      loadingStates: { commits: false },
      loadMoreCommits: vi.fn(),
      cherryPickCommit: vi.fn(),
      revertCommit: vi.fn(),
      createBranch: vi.fn(),
      createTag: vi.fn(),
      checkoutBranch: vi.fn(),
    } as any);

    render(<CommitList />);
    expect(screen.getByText("Initial commit")).toBeDefined();
    expect(screen.getByText("Salvatore")).toBeDefined();
  });
});
