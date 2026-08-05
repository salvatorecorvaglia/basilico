import { describe, expect, it } from "vitest";
import { describeSignature } from "../signature-status";

describe("describeSignature", () => {
  it("marks only an explicit GOODSIG as verified", () => {
    const verified = describeSignature("Verified");
    expect(verified.tone).toBe("verified");
    expect(verified.label).toBe("Verified");
  });

  it("never presents an unverifiable signature as trusted", () => {
    // The backend reports "Unverified" when gpg is missing or verification
    // could not run. Showing that as a green check would imply trust the app
    // has not established.
    for (const status of ["Unverified", "Signed", "", "something-unexpected"]) {
      const d = describeSignature(status);
      expect(d.tone).not.toBe("verified");
      expect(d.label).not.toBe("Verified");
    }
  });

  it("distinguishes an unknown key from an invalid signature", () => {
    expect(describeSignature("UnknownKey").tone).toBe("unknown");
    expect(describeSignature("BadSignature").tone).toBe("invalid");
    expect(describeSignature("ExpiredKey").tone).toBe("invalid");
  });

  it("always supplies a label, icon and hint", () => {
    for (const status of [
      "Verified",
      "BadSignature",
      "ExpiredKey",
      "UnknownKey",
      "Unverified",
    ]) {
      const d = describeSignature(status);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.hint.length).toBeGreaterThan(0);
      expect(d.icon).toBeTruthy();
    }
  });
});
