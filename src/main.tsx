// Fonts are bundled rather than fetched from Google's CDN: a desktop Git client
// must render correctly offline, and a CDN request on every launch leaks the
// user's IP to a third party for no benefit.
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import "./styles/index.css";

// Monaco is deliberately NOT imported here. A top-level `import * as monaco`
// made the 4.4 MB editor chunk a static dependency of the entry chunk, so Vite
// preloaded it on first paint and the `React.lazy` boundaries around the editor
// views in App.tsx bought nothing. Its setup now lives in src/lib/monaco-setup.ts,
// imported only by those lazy views.

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
