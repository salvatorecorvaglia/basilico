/* ═══════════════════════════════════════════════════════
   Basilico — Utility Functions
   ═══════════════════════════════════════════════════════ */

/**
 * Open an external URL in the system browser. Refuses anything that isn't
 * `https://` — forge-link builders always produce an https URL, but this is
 * the last line of defense against a malformed/attacker-controlled remote
 * URL producing something like a `javascript:` URL.
 *
 * Goes through the opener plugin rather than `window.open`: Tauri's webview
 * does not hand `window.open` to the system browser, so "Open on GitHub" and
 * every autolinked reference did nothing. Opening in the system browser also
 * means the page never shares a process or a window with the app.
 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { useUIStore } from "../store/ui-store";
export function openExternalUrl(url: string): void {
  if (!url.startsWith("https://")) {
    // Told, not just logged. A silent return looks identical to a dead
    // button: the user clicks "Open on GitHub", nothing happens, and the
    // only trace is a console message they will never see.
    console.error(`Refusing to open non-https URL: ${url}`);
    useUIStore.getState().addNotification({
      type: "error",
      message: "Refused to open a link that is not https.",
      description:
        "The repository's remote URL may be malformed. Check it in Settings.",
    });
    return;
  }
  openUrl(url).catch((err: unknown) => {
    console.error(`Failed to open ${url}:`, err);
    useUIStore.getState().addNotification({
      type: "error",
      message: "Could not open the link in your browser.",
      description: url,
    });
  });
}

/** Format a Unix timestamp as a relative time string (e.g., "2 hours ago") */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins}m ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days}d ago`;
  }
  if (diff < 2592000) {
    const weeks = Math.floor(diff / 604800);
    return `${weeks}w ago`;
  }
  if (diff < 31536000) {
    const months = Math.floor(diff / 2592000);
    return `${months}mo ago`;
  }
  const years = Math.floor(diff / 31536000);
  return `${years}y ago`;
}

/**
 * Format a Unix timestamp as an absolute date/time, in the user's own locale.
 * It was pinned to `en-US`, so everyone got month-first dates and a 12-hour
 * clock regardless of their system settings.
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Get initials from a name (e.g., "John Doe" → "JD") */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
}

/** Generate a consistent color from a string (for author avatars) */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

/** Get the lane color CSS variable */
export function getLaneColor(lane: number): string {
  return `var(--lane-${lane % 10})`;
}

/** Truncate a string with ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

/** Short OID (first 7 chars) */
export function shortOid(oid: string): string {
  return oid.slice(0, 7);
}

/** Get file extension from path */
export function getFileExtension(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/** Get file name from path */
export function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/** Get directory from path */
export function getDirectory(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

/** Classify file status into an icon-friendly category */
export function getStatusIcon(status: string): string {
  switch (status) {
    case "added":
      return "A";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "typechange":
      return "T";
    default:
      return "?";
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "added":
      return "var(--color-success)";
    case "modified":
      return "var(--color-warning)";
    case "deleted":
      return "var(--color-danger)";
    case "renamed":
      return "var(--color-info)";
    default:
      return "var(--text-secondary)";
  }
}

/**
 * File extension → Monaco language id. Every built-in Monaco tokenizer is
 * loaded (see `monaco-setup.ts`); this map only has to name them. It used to
 * cover about fifteen languages, so Kotlin, Swift, Ruby, PHP, SQL, XML, C and
 * many more rendered as plain text.
 */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  rs: "rust",
  py: "python",
  pyi: "python",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  swift: "swift",
  m: "objective-c",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "csharp",
  fs: "fsharp",
  fsx: "fsharp",
  vb: "vb",
  rb: "ruby",
  php: "php",
  pl: "perl",
  pm: "perl",
  lua: "lua",
  r: "r",
  dart: "dart",
  ex: "elixir",
  exs: "elixir",
  clj: "clojure",
  cljs: "clojure",
  jl: "julia",
  sol: "sol",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  xml: "xml",
  svg: "xml",
  xaml: "xml",
  plist: "xml",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  rst: "restructuredtext",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  bat: "bat",
  cmd: "bat",
  yml: "yaml",
  yaml: "yaml",
  ini: "ini",
  cfg: "ini",
  toml: "ini",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  tf: "hcl",
  hcl: "hcl",
  dockerfile: "dockerfile",
};

/** Get language code for Monaco editor based on file path extension */
export function getLanguageFromPath(filePath: string): string {
  const name = getFileName(filePath).toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.")) {
    return "dockerfile";
  }
  const ext = name.includes(".") ? name.split(".").pop() : undefined;
  return (ext && LANGUAGE_BY_EXTENSION[ext]) || "plaintext";
}
