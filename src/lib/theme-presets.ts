/* ═══════════════════════════════════════════════════════
   Basilico — Theme Presets
   Single source of truth for theme color definitions
   ═══════════════════════════════════════════════════════ */

export interface ThemePreset {
  id: string;
  color: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "sage-green", color: "#2ea043" },
  { id: "royal-blue", color: "#1f6feb" },
  { id: "amethyst-purple", color: "#8b5cf6" },
  { id: "amber-gold", color: "#d29922" },
  { id: "crimson-red", color: "#f85149" },
  { id: "ocean-teal", color: "#2dd4bf" },
];

/** Apply a theme preset to the DOM by updating the data-theme attribute */
export function applyThemeToDOM(themeId: string): void {
  const preset = THEME_PRESETS.find((p) => p.id === themeId);
  if (preset) {
    document.documentElement.setAttribute("data-theme", themeId);
  }
}
