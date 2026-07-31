/* ═══════════════════════════════════════════════════════
   Basilico — Keyboard Shortcut Parser & Matcher
   ═══════════════════════════════════════════════════════ */

export interface ParsedShortcut {
  cmdOrCtrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

/**
 * Parses a shortcut descriptor string like "CmdOrCtrl+Shift+P" into a structured object.
 */
export function parseShortcut(shortcutStr: string): ParsedShortcut {
  const parts = shortcutStr.split("+");
  let cmdOrCtrl = false;
  let shift = false;
  let alt = false;
  let key = "";

  for (const part of parts) {
    if (part === "CmdOrCtrl" || part === "Cmd" || part === "Ctrl") {
      cmdOrCtrl = true;
    } else if (part === "Shift") {
      shift = true;
    } else if (part === "Alt" || part === "Option") {
      alt = true;
    } else {
      key = part.toLowerCase();
    }
  }

  return { cmdOrCtrl, shift, alt, key };
}

/**
 * Checks if a keyboard event matches a shortcut descriptor string.
 */
export function matchesShortcut(
  e: KeyboardEvent,
  shortcutStr: string,
): boolean {
  const parsed = parseShortcut(shortcutStr);

  const matchesMeta = (e.metaKey || e.ctrlKey) === parsed.cmdOrCtrl;
  const matchesShift = e.shiftKey === parsed.shift;
  const matchesAlt = e.altKey === parsed.alt;

  if (!matchesMeta || !matchesShift || !matchesAlt) {
    return false;
  }

  if (parsed.key === "enter") return e.key === "Enter";
  if (parsed.key === ",") return e.key === ",";
  return e.key.toLowerCase() === parsed.key;
}
