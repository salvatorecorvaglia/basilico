/* ═══════════════════════════════════════════════════════
   Basilico — Commit Message Autolinking
   Splits a commit summary into plain text and linked references
   ═══════════════════════════════════════════════════════ */

export interface AutolinkSegment {
  text: string;
  /** Present when this segment is a reference that resolves to a URL. */
  url?: string;
}

/**
 * Split `message` into plain and linked segments using a user-supplied pattern.
 *
 * The pattern comes from user settings, so this has to survive anything they
 * type: an invalid regex, or — more subtly — one that can match the empty
 * string (`#?\d*`, `[A-Z]*-\d*`). A zero-length match leaves `lastIndex`
 * untouched, so a naive `exec` loop returns the same match forever and hangs
 * the renderer.
 *
 * Returns a single plain segment when no pattern is configured or the pattern
 * does not compile.
 */
export function buildAutolinkSegments(
  message: string,
  pattern: string | null | undefined,
  urlTemplate: string | null | undefined,
): AutolinkSegment[] {
  if (!pattern || !urlTemplate) {
    return [{ text: message }];
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "g");
  } catch (e) {
    console.error("Invalid autolink pattern regex:", e);
    return [{ text: message }];
  }

  const segments: AutolinkSegment[] = [];
  let lastIndex = 0;
  let match = regex.exec(message);

  while (match !== null) {
    const matchText = match[0];
    const matchIndex = match.index;

    if (matchText.length === 0) {
      // A zero-length match links nothing and leaves lastIndex where it was,
      // so `exec` would return it forever. Step over it without emitting a
      // segment — emitting the preceding text here would duplicate it, since
      // `lastIndex` has not advanced past it yet.
      regex.lastIndex++;
      match = regex.exec(message);
      continue;
    }

    if (matchIndex > lastIndex) {
      segments.push({ text: message.substring(lastIndex, matchIndex) });
    }

    segments.push({ text: matchText, url: expandUrl(urlTemplate, match) });
    lastIndex = regex.lastIndex;

    match = regex.exec(message);
  }

  if (lastIndex < message.length) {
    segments.push({ text: message.substring(lastIndex) });
  }

  return segments;
}

/** Substitute `$1`…`$n` in the template with the regex capture groups. */
function expandUrl(urlTemplate: string, match: RegExpExecArray): string {
  // split/join rather than replaceAll: the tsconfig target is ES2020, and
  // keeping to it means the bundle stays usable on the older webviews the
  // stylesheet fallbacks also support.
  const replaceAll = (haystack: string, needle: string, value: string) =>
    haystack.split(needle).join(value);

  if (match.length <= 1 || match[1] === undefined) {
    // No capture groups: `$1` stands for the whole match.
    return replaceAll(urlTemplate, "$1", match[0]);
  }

  let url = urlTemplate;
  for (let i = 1; i < match.length; i++) {
    url = replaceAll(url, `$${i}`, match[i] ?? "");
  }
  return url;
}
