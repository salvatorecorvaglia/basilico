import { describe, expect, it } from "vitest";
import { friendlyErrorMessage } from "../../src/lib/error-messages";

describe("error-messages", () => {
  it("should map authentication errors correctly", () => {
    expect(
      friendlyErrorMessage("git error: failed to authenticate with server"),
    ).toBe(
      "Authentication failed. Please check your SSH key or credentials in Settings.",
    );
  });

  it("should map permission denied errors correctly", () => {
    expect(friendlyErrorMessage("Permission denied (publickey).")).toBe(
      "Permission denied. You may not have access to this repository or the SSH key is not authorized.",
    );
  });

  it("should map merge conflict errors correctly", () => {
    expect(
      friendlyErrorMessage(
        "Automatic merge failed; fix conflict_resolver and commit",
      ),
    ).toBe(
      "Merge conflicts detected. Please resolve the conflicts in the staging area before continuing.",
    );
  });

  it("should map index.lock errors correctly", () => {
    expect(
      friendlyErrorMessage(
        "Unable to create '/path/.git/index.lock': File exists.",
      ),
    ).toBe(
      "Another git process appears to be running. If not, delete the .git/index.lock file manually.",
    );
  });

  it("should return the unmapped raw message if no pattern matches", () => {
    const raw = "Custom unusual error message from system";
    expect(friendlyErrorMessage(raw)).toBe(raw);
  });
});
