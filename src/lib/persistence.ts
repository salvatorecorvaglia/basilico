/* ═══════════════════════════════════════════════════════
   Basilico — Persisted Keys
   One place naming everything the app stores in localStorage
   ═══════════════════════════════════════════════════════ */

/**
 * Every key the app persists, named once.
 *
 * These were string literals spread across `App.tsx`, `tabs-slice.ts` (fourteen
 * occurrences), `settings-slice.ts`, `color-scheme.ts` and the pre-paint
 * `resources/theme-loader.js`. A typo in any of them silently read or wrote a
 * different key — the value simply never came back, with nothing to fail.
 *
 * `resources/theme-loader.js` runs before the bundle and so cannot import from
 * here; the two theme keys below are the ones it duplicates, and
 * `tests/lib/persistence.test.ts` asserts they still agree.
 */
export const STORAGE_KEYS = {
  openRepos: "basilico-open-repos",
  activeRepo: "basilico-active-repo",
  recentRepos: "basilico-recent-repos",
  theme: "basilico-theme",
  colorScheme: "basilico-color-scheme",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
