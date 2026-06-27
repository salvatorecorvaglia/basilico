import { describe, expect, it, vi } from "vitest";
import { withLoading } from "../store-helpers";

describe("store-helpers", () => {
  describe("withLoading", () => {
    it("should set loading to true, run function, and set loading to false", async () => {
      const get = vi.fn().mockReturnValue({
        loadingStates: { commits: false },
      });
      const set = vi.fn();
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

      // Verify setLoading call sequence:
      // First call starts loading and clears error
      expect(set).toHaveBeenNthCalledWith(1, {
        loadingStates: { commits: true },
      });
      expect(set).toHaveBeenNthCalledWith(2, {
        error: null,
      });
      // Last call stops loading
      expect(set).toHaveBeenLastCalledWith({
        loadingStates: { commits: false },
      });
    });

    it("should set error and turn off loading when action throws", async () => {
      const get = vi.fn().mockReturnValue({
        loadingStates: { commits: false },
      });
      const set = vi.fn();
      const action = vi.fn().mockRejectedValue(new Error("Failed"));

      await expect(
        withLoading(get, set, "commits", "Error prefix", action),
      ).rejects.toThrow("Failed");

      expect(set).toHaveBeenCalledWith({
        error: "Error: Failed",
      });
      expect(set).toHaveBeenLastCalledWith({
        loadingStates: { commits: false },
      });
    });
  });
});
