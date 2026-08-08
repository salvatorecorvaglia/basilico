import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Copied!" feedback that clears itself, and cancels on unmount.
 *
 * Four components each hand-rolled `setTimeout(() => setCopied(false), 2000)`
 * with no cleanup, so closing a modal within the window left a timer pointing
 * at an unmounted component. Harmless under React 19, but it is the same code
 * four times and the cleanup belongs in one place.
 *
 * `key` lets a list distinguish *which* row was copied; omit it for a single
 * copy target and treat `copied` as a boolean.
 */
export function useCopyFeedback(resetAfterMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const markCopied = useCallback(
    (key = "default") => {
      clear();
      setCopiedKey(key);
      timer.current = setTimeout(() => {
        setCopiedKey(null);
        timer.current = null;
      }, resetAfterMs);
    },
    [clear, resetAfterMs],
  );

  const isCopied = useCallback(
    (key = "default") => copiedKey === key,
    [copiedKey],
  );

  return { copiedKey, isCopied, markCopied };
}
