// Runs before first paint to avoid a flash of the wrong theme. Mirrors
// src/lib/theme-presets.ts (accent) and src/lib/color-scheme.ts (light/dark);
// both re-apply the same values once React mounts.
(() => {
  const theme = localStorage.getItem("basilico-theme") || "sage-green";
  document.documentElement.setAttribute("data-theme", theme);

  // Only an explicit choice is stored; "system" leaves the :root declaration
  // in theme.css to resolve light-dark() against the OS preference.
  const scheme = localStorage.getItem("basilico-color-scheme");
  if (scheme === "light" || scheme === "dark") {
    document.documentElement.style.colorScheme = scheme;
  }
})();
