import { describe, expect, it } from "vitest";
import { describeSignature } from "../../src/lib/signature-status";

describe("describeSignature", () => {
  it("marks only a good signature from a trusted key as verified", () => {
    const verified = describeSignature("Verified");
    expect(verified.tone).toBe("verified");
    expect(verified.label).toBe("Verified");
  });

  it("does not present a valid signature from an untrusted key as verified", () => {
    // The backend reports "UntrustedKey" when gpg returns GOODSIG but the key
    // carries no trust. The signature is real; the identity behind it is not
    // established, and the UID shown is one its creator chose.
    const untrusted = describeSignature("UntrustedKey");
    expect(untrusted.tone).toBe("unknown");
    expect(untrusted.label).not.toBe("Verified");
  });

  it("treats a revoked signing key as invalid", () => {
    expect(describeSignature("RevokedKey").tone).toBe("invalid");
  });

  it("never presents an unverifiable signature as trusted", () => {
    // The backend reports "Unverified" when gpg is missing or verification
    // could not run. Showing that as a green check would imply trust the app
    // has not established.
    for (const status of [
      "Unverified",
      "UntrustedKey",
      "RevokedKey",
      "Signed",
      "",
      "something-unexpected",
    ]) {
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
      "UntrustedKey",
      "RevokedKey",
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
