import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { WelcomeScreen } from "../WelcomeScreen";

// Mock Lucide icons to avoid rendering complexities
vi.mock("lucide-react", () => ({
  FolderOpen: () => <div data-testid="folder-open-icon" />,
  ArrowRight: () => <div data-testid="arrow-right-icon" />,
}));

// Mock Tauri plugin-dialog
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

// Mock useRepoStore
const mockOpenRepository = vi.fn();
vi.mock("../../store/repo-store", () => ({
  useRepoStore: () => ({
    openRepository: mockOpenRepository,
    isLoading: false,
    loadingStates: {
      global: false,
      commits: false,
      status: false,
      diff: false,
      staging: false,
      branches: false,
      blame: false,
      history: false,
      stashes: false,
      search: false,
      collaboration: false,
      settings: false,
    },
  }),
}));

describe("WelcomeScreen Component", () => {
  it("renders title and subtitle correctly", () => {
    render(<WelcomeScreen />);
    expect(screen.getByText("Basilico")).toBeInTheDocument();
    expect(
      screen.getByText("Modern Git, at your fingertips"),
    ).toBeInTheDocument();
  });

  it("renders open repository button", () => {
    render(<WelcomeScreen />);
    const button = screen.getByRole("button", { name: /Open Repository/i });
    expect(button).toBeInTheDocument();
    expect(
      screen.getByText("Browse to a local Git repository"),
    ).toBeInTheDocument();
  });

  it("handles open repository dialog flow", async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(open).mockResolvedValue("/path/to/repo");

    render(<WelcomeScreen />);
    const button = screen.getByRole("button", { name: /Open Repository/i });
    fireEvent.click(button);

    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Open Git Repository",
    });
  });
});
