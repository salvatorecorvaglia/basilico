# 🌿 Basilico — Cross-Platform Desktop Git Client

Basilico is a fast, modern, and beautiful Git GUI client built using **Tauri 2**, **Rust**, **React**, and **TypeScript**. It is designed from the ground up for visual elegance and extreme performance, even on massive repositories.

<p align="center">
  <img src="src-tauri/icons/128x128.png" width="100" alt="Basilico Logo" />
</p>

---

## Key Features

- **⚡ Blazing Fast**: Built with Rust backend (`git2`/`libgit2` bindings) and virtualized lists (TanStack Virtual) on the frontend.
- **📈 Rich Commit Graph**: Canvas-based interactive DAG commit graph with custom lane allocation.
- **🗂️ Tabbed Repository Management**: Open and switch between multiple repositories in clean, lightweight tabs.
- **🌓 Custom Premium Aesthetics**: Tailored dark-mode-first styling with sleek borders, gradients, and micro-animations.
- **🔍 File Diff & History**: Monaco Editor-based diff viewing for side-by-side or inline modifications.
- **🛠️ Fully Configurable Layout**: 3-panel resizable workspace (Sidebar, Commit Graph/List, and Commit Detail).

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | Tauri 2 |
| **Backend** | Rust + `git2` + `tokio` + `notify` |
| **Frontend** | React 19 + TypeScript + Zustand |
| **Bundler** | Vite |
| **State** | Zustand stores (Repo & UI) |
| **Virtualization** | TanStack Virtual |
| **Layout** | `react-resizable-panels` |
| **Icons** | Lucide React |

---

## Getting Started

### Prerequisites

Make sure you have the following installed on your system:
- **Node.js** (v18 or higher)
- **Rust toolchain** (via `rustup`)
- **System dependencies** (as required by Tauri for your OS)

### Running in Development Mode

To start the development server (Vite + Tauri):

```bash
# Install dependencies
npm install

# Run the app in development
npm run tauri dev
```

For split terminal setups, you can also run them separately:
```bash
# Terminal 1: Start the Vite frontend server
npm run dev

# Terminal 2: Run the Tauri native container
cd src-tauri && cargo run
```

### Building for Production

To build the production-ready installers (DMG for macOS, EXE for Windows, DEB/AppImage for Linux):

```bash
npm run tauri build
```

---

## Project Structure

- `src-tauri/` — Rust backend (Tauri host, git2 interface, file system watcher, commands)
- `src/` — React frontend (Design system, resizable layout shell, Canvas commit graph, custom stores)
- `src/components/graph/` — Commit list and canvas graph rendering logic
- `src/store/` — State management via Zustand

---

🌿 *Basilico — Modern Git, at your fingertips.*
