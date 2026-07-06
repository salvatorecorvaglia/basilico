import { describe, expect, it } from "vitest";
import { friendlyErrorMessage } from "../error-messages";

describe("friendlyErrorMessage", () => {
  it("should map authentication errors", () => {
    const msg = friendlyErrorMessage("failed to authenticate with remote");
    expect(msg).toContain("Authentication failed");
  });

  it("should map permission denied errors", () => {
    const msg = friendlyErrorMessage("permission denied (publickey)");
    expect(msg).toContain("Permission denied");
  });

  it("should map fast-forward errors", () => {
    const msg = friendlyErrorMessage("cannot fast-forward branch 'main'");
    expect(msg).toContain("Cannot fast-forward");
  });

  it("should map push rejection errors", () => {
    const msg = friendlyErrorMessage(
      "failed to push some refs: updates were rejected",
    );
    expect(msg).toContain("Push rejected");
  });

  it("should map branch exists errors", () => {
    const msg = friendlyErrorMessage("branch 'feature/login' already exists");
    expect(msg).toContain("already exists");
  });

  it("should map nothing to commit", () => {
    const msg = friendlyErrorMessage("nothing to commit, working tree clean");
    expect(msg).toContain("Nothing to commit");
  });

  it("should map repository not found", () => {
    const msg = friendlyErrorMessage(
      "could not find repository from '/tmp/notarepo'",
    );
    expect(msg).toContain("Could not find a git repository");
  });

  it("should map index.lock errors", () => {
    const msg = friendlyErrorMessage(
      "unable to create '/repo/.git/index.lock': File exists.",
    );
    expect(msg).toContain("Another git process");
  });

  it("should map merge conflict errors", () => {
    const msg = friendlyErrorMessage(
      "merge conflict in file.txt, conflicting files detected",
    );
    expect(msg).toContain("Merge conflicts");
  });

  it("should map path traversal errors", () => {
    const msg = friendlyErrorMessage(
      "path traversal detected: ../../../etc/passwd",
    );
    expect(msg).toContain("outside the repository");
  });

  it("should return original message for unmapped errors", () => {
    const original = "some very specific error nobody maps";
    expect(friendlyErrorMessage(original)).toBe(original);
  });

  it("should handle empty string", () => {
    expect(friendlyErrorMessage("")).toBe("");
  });
});
