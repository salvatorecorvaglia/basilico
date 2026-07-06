import { describe, expect, it, vi } from "vitest";
import {
  clearError,
  setError,
  setLoading,
  withLoading,
} from "../store-helpers";
import type { RepoState } from "../types";

// Minimal mock for store state
function createMockStore(overrides: Partial<RepoState> = {}) {
  const state = {
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
    isLoading: false,
    error: null,
    errors: {},
    ...overrides,
  } as unknown as RepoState;

  const get = vi.fn(() => state);
  const set = vi.fn(
    (update: Partial<RepoState> | ((s: RepoState) => Partial<RepoState>)) => {
      if (typeof update === "function") {
        Object.assign(state, update(state));
      } else {
        Object.assign(state, update);
      }
    },
  );

  return { state, get, set };
}

describe("store-helpers", () => {
  describe("setLoading", () => {
    it("should set a domain loading flag and recalculate isLoading", () => {
      const { get, set } = createMockStore();

      setLoading(get, set, "commits", true);

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          loadingStates: expect.objectContaining({ commits: true }),
          isLoading: true,
        }),
      );
    });

    it("should set isLoading to false when no domains are loading", () => {
      const { get, set } = createMockStore({
        loadingStates: {
          global: false,
          commits: true,
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
        isLoading: true,
      });

      setLoading(get, set, "commits", false);

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: false }),
      );
    });

    it("should keep isLoading true when other domains are still loading", () => {
      const { get, set } = createMockStore({
        loadingStates: {
          global: false,
          commits: true,
          status: true,
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
      });

      setLoading(get, set, "commits", false);

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true }),
      );
    });
  });

  describe("setError / clearError", () => {
    it("should set both global error and domain error", () => {
      const { get, set } = createMockStore();

      setError(get, set, "commits", "Something failed");

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Something failed",
          errors: { commits: "Something failed" },
        }),
      );
    });

    it("should clear domain error", () => {
      const { get, set } = createMockStore({
        errors: { commits: "Old error" },
      });

      clearError(get, set, "commits");

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.objectContaining({ commits: null }),
        }),
      );
    });
  });

  describe("withLoading", () => {
    it("should set loading, run function, and clear loading", async () => {
      const { get, set } = createMockStore();
      const action = vi.fn().mockResolvedValue("result");

      const res = await withLoading(
        get,
        set,
        "commits",
        "Error prefix",
        action,
      );

      expect(res).toBe("result");
      expect(action).toHaveBeenCalled();
    });

    it("should set error and turn off loading when action throws", async () => {
      const { get, set } = createMockStore();
      const action = vi.fn().mockRejectedValue(new Error("Failed"));

      await expect(
        withLoading(get, set, "commits", "Error prefix", action),
      ).rejects.toThrow("Failed");

      // Error should have been set
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Failed"),
        }),
      );
    });
  });
});
