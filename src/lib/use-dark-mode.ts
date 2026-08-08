import { useColorScheme } from "./color-scheme";

/**
 * Whether the app is currently rendering dark.
 *
 * Thin wrapper over {@link useColorScheme} so the Monaco-hosting views keep
 * their existing call shape while sharing the one source of truth — this used
 * to read `prefers-color-scheme` directly, which meant it ignored the Toolbar's
 * manual light/dark override entirely and left the editors mismatched.
 */
export function useDarkMode(): boolean {
  return useColorScheme().isDark;
}
