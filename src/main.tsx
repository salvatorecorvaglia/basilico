import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// Configure Monaco Environment for local web workers in Vite
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

// Configure the loader to use the local monaco instance instead of fetching from CDN
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
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.style.colorScheme === "dark" ||
        getComputedStyle(document.documentElement)
          .getPropertyValue("color-scheme")
          .includes("dark");
      value = (isDark ? parts[1] : parts[0]).trim();
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

// Configure Monaco Editor themes globally
loader.init().then((monacoInstance) => {
  defineMonacoThemes(monacoInstance);

  // Re-define themes when the data-theme attribute changes
  const observer = new MutationObserver(() => {
    defineMonacoThemes(monacoInstance);
    // Force re-apply of theme to redraw all mounted editor instances with new CSS variables
    const isDark =
      document.documentElement.classList.contains("dark") ||
      document.documentElement.style.colorScheme === "dark" ||
      getComputedStyle(document.documentElement)
        .getPropertyValue("color-scheme")
        .includes("dark");
    monacoInstance.editor.setTheme(isDark ? "basilico-dark" : "basilico-light");
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class"],
  });
});

import { ErrorBoundary } from "./components/layout/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
