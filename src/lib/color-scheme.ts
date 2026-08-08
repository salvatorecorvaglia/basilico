/* ═══════════════════════════════════════════════════════
   Basilico — Colour Scheme (light / dark / system)
   Single source of truth for whether the app renders dark
   ═══════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";

export type ColorSchemePreference = "light" | "dark" | "system";

export const COLOR_SCHEME_STORAGE_KEY = "basilico-color-scheme";

/**
 * There used to be three answers to "is the app dark right now", and two of
 * them were wrong.
 *
 * `theme.css` sets `color-scheme: dark light` on `:root` unconditionally — that
 * is a *list of supported schemes*, not the active one. Two call sites read it
 * back with `getComputedStyle(...).includes("dark")`, which is therefore always
 * true, so the Toolbar toggle always initialised to "dark" and Monaco was
 * forced to its dark theme on every accent change regardless of the real
 * appearance. A third mechanism added `.dark`/`.light` classes that no
 * stylesheet ever matched.
 *
 * The browser's own answer is `prefers-color-scheme`, and an explicit user
 * choice overrides it by setting the inline `color-scheme` property — which is
 * what `light-dark()` in `theme.css` actually resolves against.
 */
export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readStoredPreference(): ColorSchemePreference {
  const stored = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function resolveIsDark(preference: ColorSchemePreference): boolean {
  return preference === "system" ? prefersDark() : preference === "dark";
}

/**
 * Apply the preference to the document.
 *
 * Setting the inline `color-scheme` is what actually drives `light-dark()` and
 * the UA's own form/scrollbar rendering; "system" clears the override so the
 * `:root` declaration takes over again.
 */
export function applyColorSchemeToDOM(preference: ColorSchemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.style.removeProperty("color-scheme");
  } else {
    root.style.colorScheme = preference;
  }
}

/**
 * The active colour scheme, its persisted preference, and a setter.
 *
 * Every consumer — Monaco's theme prop included — must derive "is dark" from
 * here so a manual override and the OS default cannot disagree.
 */
export function useColorScheme() {
  const [preference, setPreferenceState] =
    useState<ColorSchemePreference>(readStoredPreference);
  const [isDark, setIsDark] = useState(() =>
    resolveIsDark(readStoredPreference()),
  );

  useEffect(() => {
    applyColorSchemeToDOM(preference);
    setIsDark(resolveIsDark(preference));

    // Only track the OS while the user has not made an explicit choice.
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [preference]);

  const setPreference = (next: ColorSchemePreference) => {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next);
    setPreferenceState(next);
  };

  return { isDark, preference, setPreference };
}
