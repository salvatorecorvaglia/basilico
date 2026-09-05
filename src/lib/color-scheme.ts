/* ═══════════════════════════════════════════════════════
   Basilico — Colour Scheme (light / dark / system)
   Single source of truth for whether the app renders dark
   ═══════════════════════════════════════════════════════ */

import { useEffect, useState, useSyncExternalStore } from "react";

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
 * The attribute `theme.css` reads to tell an explicit choice from "system".
 * Exported so tests and any future consumer use the same string.
 */
export const COLOR_SCHEME_ATTRIBUTE = "data-color-scheme";

/**
 * Apply the preference to the document.
 *
 * Two writes, because two mechanisms render the theme and both have to agree:
 *
 * - The inline `color-scheme` drives `light-dark()` in `theme.css` and the UA's
 *   own form/scrollbar rendering.
 * - The `data-color-scheme` attribute drives the plain-value fallback blocks
 *   that engines without `light-dark()` support fall back to. Those blocks used
 *   to key off `@media (prefers-color-scheme: dark)` alone — which reports the
 *   *OS* setting and ignores the inline property above — so they overrode the
 *   light-dark() result whenever the OS was dark, and picking "Light" on a
 *   dark-mode OS did nothing at all.
 *
 * "system" clears both, so the `:root` declaration and the media query take
 * over again.
 */
export function applyColorSchemeToDOM(preference: ColorSchemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.style.removeProperty("color-scheme");
    root.removeAttribute(COLOR_SCHEME_ATTRIBUTE);
  } else {
    root.style.colorScheme = preference;
    root.setAttribute(COLOR_SCHEME_ATTRIBUTE, preference);
  }
}

/**
 * The preference is one value for the whole app, so it lives in one place
 * rather than in each caller's `useState`.
 *
 * It has several live consumers — the toolbar toggle, the Settings › Appearance
 * control, and `useDarkMode`, which feeds Monaco's theme in every editor view.
 * With per-component state they each held their own copy: switching the scheme
 * re-rendered only the control that did it, so an already-mounted diff or blame
 * view kept Monaco on the old theme until it happened to remount, and the two
 * controls showed different values. A module-level store read through
 * `useSyncExternalStore` keeps every consumer on the same value.
 */
let currentPreference: ColorSchemePreference | null = null;
const preferenceListeners = new Set<() => void>();

function getPreferenceSnapshot(): ColorSchemePreference {
  if (currentPreference === null) currentPreference = readStoredPreference();
  return currentPreference;
}

function subscribeToPreference(onChange: () => void): () => void {
  preferenceListeners.add(onChange);
  return () => {
    preferenceListeners.delete(onChange);
  };
}

/**
 * Persist a preference and apply it, notifying every consumer.
 *
 * The DOM is written here rather than in an effect so the change lands before
 * React re-renders — the scheme must not lag a frame behind the control.
 */
export function setColorSchemePreference(next: ColorSchemePreference): void {
  localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next);
  currentPreference = next;
  applyColorSchemeToDOM(next);
  for (const listener of preferenceListeners) listener();
}

/**
 * The active colour scheme, its persisted preference, and a setter.
 *
 * Every consumer — Monaco's theme prop included — must derive "is dark" from
 * here so a manual override and the OS default cannot disagree.
 */
export function useColorScheme() {
  const preference = useSyncExternalStore(
    subscribeToPreference,
    getPreferenceSnapshot,
    getPreferenceSnapshot,
  );
  const [systemDark, setSystemDark] = useState(prefersDark);

  // The OS preference is tracked unconditionally: an explicit choice ignores
  // it, but the app must already know the right value the moment the user
  // switches back to "system".
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  // Mirrors the stored preference onto the document on first mount; later
  // changes are applied by the setter above.
  useEffect(() => {
    applyColorSchemeToDOM(preference);
  }, [preference]);

  const isDark = preference === "system" ? systemDark : preference === "dark";

  return { isDark, preference, setPreference: setColorSchemePreference };
}
