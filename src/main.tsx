import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { loader } from "@monaco-editor/react";
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

// Configure Monaco Editor themes globally
loader.init().then((monacoInstance) => {
  monacoInstance.editor.defineTheme("basilico-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0d0d11", // matches var(--bg-surface) in dark mode
      "editor.lineHighlightBackground": "#1c1c27", // matches var(--bg-hover) in dark mode
      "editorLineNumber.foreground": "#60606a",
      "editorLineNumber.activeForeground": "#a1a1aa",
    },
  });
  monacoInstance.editor.defineTheme("basilico-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff", // matches var(--bg-surface) in light mode
      "editor.lineHighlightBackground": "#f1f3f6", // matches var(--bg-hover) in light mode
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#0f172a",
    },
  });
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
