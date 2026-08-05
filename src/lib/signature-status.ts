/* ═══════════════════════════════════════════════════════
   Basilico — GPG Signature Presentation
   Maps backend signature statuses to user-facing labels
   ═══════════════════════════════════════════════════════ */

import {
  type LucideIcon,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";

export type SignatureTone = "verified" | "unknown" | "invalid";

export interface SignatureDescriptor {
  label: string;
  tone: SignatureTone;
  icon: LucideIcon;
  hint: string;
}

/**
 * A signature that merely exists is not a trusted one. Only an explicit
 * GOODSIG from gpg earns the verified treatment — every other state (gpg not
 * installed, key not in the local keyring, expired, forged) must be visually
 * distinct so a green check never implies trust the app has not established.
 */
export function describeSignature(status: string): SignatureDescriptor {
  switch (status) {
    case "Verified":
      return {
        label: "Verified",
        tone: "verified",
        icon: ShieldCheck,
        hint: "Signature verified against a key in your local GPG keyring.",
      };
    case "BadSignature":
      return {
        label: "Bad signature",
        tone: "invalid",
        icon: ShieldAlert,
        hint: "The signature does not match this commit's contents. Treat this commit as untrusted.",
      };
    case "ExpiredKey":
      return {
        label: "Expired key",
        tone: "invalid",
        icon: ShieldAlert,
        hint: "The signature is valid but the signing key has expired.",
      };
    case "UnknownKey":
      return {
        label: "Unknown key",
        tone: "unknown",
        icon: ShieldQuestion,
        hint: "This commit is signed, but the signing key is not in your local keyring, so it could not be verified.",
      };
    default:
      return {
        label: "Unverified",
        tone: "unknown",
        icon: ShieldQuestion,
        hint: "This commit carries a signature, but it could not be verified — gpg may not be installed or available on PATH.",
      };
  }
}
