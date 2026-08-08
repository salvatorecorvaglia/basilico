/* ═══════════════════════════════════════════════════════
   Basilico — Monaco bootstrap (deferred)
   Imported by the editor views, never by the app entry
   ═══════════════════════════════════════════════════════ */

import { loader } from "@monaco-editor/react";
// The core editor API only. The package's default entry additionally registers
// the TypeScript/CSS/HTML/JSON *language services*, which are worker-backed and
// dragged ~9 MB of worker bundles into the build (ts.worker alone was 6.9 MB).
import * as monaco from "monaco-editor/editor/editor.api";
// Tokenizers for every built-in language: this is what colours the code. It is
// pure syntax highlighting and involves no workers, so diffs stay highlighted
// while losing only IntelliSense and validation — neither of which a read-only
// diff, blame, or file viewer can use.
import "monaco-editor/basic-languages/monaco.contribution";
// JSON is the one language `basic-languages` does not cover — its tokenizer
// lives in the language service. package.json, tsconfig, lockfiles and CI
// manifests are everyday diffs in a Git client, so losing JSON highlighting is
// not acceptable. Its worker is 430 KB, versus 6.9 MB for TypeScript's.
import "monaco-editor/language/json/monaco.contribution";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import jsonWorker from "monaco-editor/language/json/json.worker.js?worker";

/**
 * This module exists to keep Monaco off the startup path.
 *
 * `main.tsx` used to `import * as monaco from "monaco-editor"` at the top
 * level, which made the 4.4 MB Monaco chunk a static dependency of the entry
 * chunk — Vite emitted a `<link rel="modulepreload">` for it in `index.html`,
 * so it was fetched and parsed on first paint. That silently defeated the
 * `React.lazy` boundaries around every editor view in `App.tsx`.
 *
 * Every value-import of Monaco now lives here, and this module is imported
 * only by those already-lazy views, so the chunk loads the first time a user
 * actually opens a diff, blame, or file viewer.
 */

// Only the core editor worker and JSON are registered. The TypeScript, CSS and
// HTML workers exist to provide language *services* — IntelliSense, type
// checking, validation — which a read-only diff/blame viewer never uses. They
// cost ~8.7 MB of bundle (the TS worker alone is 6.9 MB) and would decorate
// diffs with spurious error squiggles. Syntax highlighting is tokenisation and
// does not involve workers, so it is unaffected.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    return label === "json" ? new jsonWorker() : new editorWorker();
  },
};

// Highlighting only. Every view that hosts an editor is read-only, so schema
// validation would decorate diffs with squiggles the user cannot act on.
//
// The `editor.api` subpath's types do not declare the `json` namespace — that
// lives in the full package types — so reach it through a narrow local shape
// rather than widening the whole import to `any`.
type JsonDefaults = {
  jsonDefaults: {
    setDiagnosticsOptions: (options: {
      validate: boolean;
      allowComments: boolean;
      schemaValidation: "ignore";
    }) => void;
  };
};

(
  monaco.languages as unknown as { json: JsonDefaults }
).json.jsonDefaults.setDiagnosticsOptions({
  validate: false,
  allowComments: true,
  schemaValidation: "ignore",
});

// Use the bundled Monaco rather than letting @monaco-editor/react fetch one
// from a CDN: the app must work offline and must not phone home.
loader.config({ monaco });

function splitLightDark(str: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Whether the document is currently rendering dark.
 *
 * Reads the same state `useColorScheme` writes: an explicit inline
 * `color-scheme` override if the user picked one, otherwise the OS preference.
 * Deliberately *not* `getComputedStyle(...).getPropertyValue("color-scheme")` —
 * `theme.css` sets that to the literal list `"dark light"`, so the previous
 * `.includes("dark")` test was true no matter what was on screen, which forced
 * every editor to the dark theme even in light mode.
 */
function isDarkNow(): boolean {
  const explicit = document.documentElement.style.colorScheme;
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Reads CSS custom properties from the DOM to derive Monaco theme colors.
 * Falls back to sensible defaults if variables are not defined.
 */
function getCssVar(name: string, fallback: string): string {
  let value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (!value) return fallback;

  if (value.startsWith("light-dark(")) {
    const content = value.slice("light-dark(".length, -1);
    const parts = splitLightDark(content);
    if (parts.length === 2) {
      value = (isDarkNow() ? parts[1] : parts[0]).trim();
    }
  }

  return value || fallback;
}

function defineMonacoThemes(monacoInstance: typeof monaco) {
  monacoInstance.editor.defineTheme("basilico-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": getCssVar("--bg-surface", "#0d0d11"),
      "editor.lineHighlightBackground": getCssVar("--bg-hover", "#1c1c27"),
      "editorLineNumber.foreground": getCssVar("--text-tertiary", "#60606a"),
      "editorLineNumber.activeForeground": getCssVar(
        "--text-secondary",
        "#a1a1aa",
      ),
    },
  });
  monacoInstance.editor.defineTheme("basilico-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": getCssVar("--bg-surface", "#ffffff"),
      "editor.lineHighlightBackground": getCssVar("--bg-hover", "#f1f3f6"),
      "editorLineNumber.foreground": getCssVar("--text-tertiary", "#94a3b8"),
      "editorLineNumber.activeForeground": getCssVar(
        "--text-secondary",
        "#0f172a",
      ),
    },
  });
}

loader.init().then((monacoInstance) => {
  defineMonacoThemes(monacoInstance);

  // Re-derive the palette when the accent (`data-theme`) or the light/dark
  // override (inline `style`) changes, then re-apply so mounted editors redraw.
  const observer = new MutationObserver(() => {
    defineMonacoThemes(monacoInstance);
    monacoInstance.editor.setTheme(
      isDarkNow() ? "basilico-dark" : "basilico-light",
    );
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "style"],
  });
});

/**
 * Shared `onMount` handler that works around a Monaco leak.
 *
 * Monaco retains text models after `dispose()`, so the editor is torn down but
 * its buffers are not. Four of the six editor views already patched `dispose`
 * individually; `MergeEditor` and `FileViewerModal` did not, despite being
 * opened and closed repeatedly. Routing all of them through one helper keeps
 * the fix from drifting again.
 */
export function disposeModelsOnUnmount(editor: {
  dispose: () => void;
  setModel?: (model: null) => void;
  getModel?: () => unknown;
  getOriginalEditor?: () => { setModel: (model: null) => void };
  getModifiedEditor?: () => { setModel: (model: null) => void };
}): void {
  const originalDispose = editor.dispose.bind(editor);
  editor.dispose = () => {
    try {
      // Diff editors hold two models; plain editors hold one.
      if (editor.getOriginalEditor && editor.getModifiedEditor) {
        editor.getOriginalEditor().setModel(null);
        editor.getModifiedEditor().setModel(null);
      } else if (editor.setModel) {
        editor.setModel(null);
      }
    } catch {
      // Already torn down — nothing to release.
    }
    originalDispose();
  };
}
