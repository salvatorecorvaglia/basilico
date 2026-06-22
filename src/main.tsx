import { loader } from "@monaco-editor/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// Configure Monaco Editor themes globally
loader.init().then((monaco) => {
  monaco.editor.defineTheme("basilico-dark", {
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
  monaco.editor.defineTheme("basilico-light", {
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
