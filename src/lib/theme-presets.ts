/* ═══════════════════════════════════════════════════════
   Basilico — Theme Presets
   Single source of truth for theme color definitions
   ═══════════════════════════════════════════════════════ */

export interface ThemePreset {
  id: string;
  /** Human-readable name shown next to the swatch in Settings. */
  name: string;
  /**
   * The swatch colour, which is legitimately a literal: it *previews* an accent
   * rather than participating in the theme, so it cannot be a token that the
   * accent itself defines. This list is the one place it may appear —
   * SettingsModal used to keep a second copy of the same six values.
   */
  color: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "sage-green", name: "Sage Green", color: "#2ea043" },
  { id: "royal-blue", name: "Royal Blue", color: "#1f6feb" },
  { id: "amethyst-purple", name: "Amethyst Purple", color: "#8b5cf6" },
  { id: "amber-gold", name: "Amber Gold", color: "#d29922" },
  { id: "crimson-red", name: "Crimson Red", color: "#f85149" },
  { id: "ocean-teal", name: "Ocean Teal", color: "#2dd4bf" },
];

/** Apply a theme preset to the DOM by updating the data-theme attribute */
export function applyThemeToDOM(themeId: string): void {
  const preset = THEME_PRESETS.find((p) => p.id === themeId);
  if (preset) {
    document.documentElement.setAttribute("data-theme", themeId);
  }
}
