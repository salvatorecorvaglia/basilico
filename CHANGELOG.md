# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add Linux ARM64 desktop release builds, including `linux-aarch64` updater artifacts in CI and release manifests.
- Add a build-time `BASILICO_DISABLE_UPDATE_CHECK=1` opt-out for the automatic startup update check.

### Changed

- Update Tauri JavaScript API and CLI to `2.12.5`, the Rust runtime to `2.12.6`, tauri-build to `2.7.5`, and UUID to `1.29.3`; refresh lockfiles.
- Update Lucide to `1.75.0`, react-resizable-panels to `4.24.0`, Biome to `2.6.8`, Testing Library user-event to `14.6.12`, and Vitest with V8 coverage to `5.1.1`; refresh dependency overrides and the lockfile.

### Fixed

- Stabilize native desktop smoke tests by acknowledging each input keystroke, waiting for actual commit form submission, and polling webview layout after resizing. Save commit-form and minimum-layout diagnostics on failure.

## [1.3.0] - 2026-11-15

### Added

- Repository-specific commit drafts that survive tab switches.
- Code-search results open working-tree blame at the matching line, with
  virtualized blame rows for larger files.
- Native desktop smoke tests for real Git workflows and webviews on Linux and
  macOS, plus native command regression checks on macOS and Windows.

### Changed

- Serialize repository mutations to prevent overlapping Git operations from
  changing the index, working tree or refs concurrently.
- Bound subprocess output and execution time, drain stdout and stderr
  concurrently, and terminate child processes on cancellation or timeout.
- Enforce content and serialized-response limits before sending diff, blame,
  conflict and search data to the UI; reject non-UTF-8 text in editors.
- Code search uses NUL-delimited filenames, bounded records and a timeout;
  search results now indicate when the display limit is reached.
- Update frontend and Rust dependencies, including Vite `8.3.8`, Zustand
  `5.1.0`, lucide-react `1.72.0`, react-resizable-panels `4.22.1` and
  parking_lot `0.13.0`. Align Vitest and V8 coverage tooling at `5.1.0` and
  declare supported Node.js versions.
- CI enforces frontend coverage floors, uploads coverage and desktop diagnostics,
  checks all TypeScript configurations, and runs Rust tests with the lockfile.
- Release version validation uses the shared version-checking script.
- Backport the GLib `0.18.5` variant-iterator fix for RUSTSEC-2024-0429 in the
  Linux GTK stack, with debug and optimized regression checks.

### Fixed

- Amend loads the actual HEAD commit independently of graph filters and refuses
  to update a commit if HEAD changed after its message was loaded.
- Merged-branch sweeping revalidates the scanned target and branch tips before
  deletion, protecting branches that changed after the scan.
- Conflict editing handles diff3 sections and custom marker sizes, blocks saves
  with incomplete or unresolved markers, and rejects files that are no longer
  conflicted or cannot safely be edited as text.
- Stale asynchronous responses no longer overwrite newer tab, file-selection,
  search, rebase or bisect state; loading indicators track pending requests.
- Network progress and Git prompts are scoped to their operation, preventing
  stale events or replies from affecting another operation.
- Improve repository watcher refresh handling for refs, linked worktrees and
  working-tree changes.
- Search failures are reported in the view, and clearing or changing a search
  prevents an earlier request from restoring obsolete results.
- Windows integration-test executables embed the Common Controls manifest
  required by native dialogs, and Git test fixtures use consistent LF line endings.
- Native desktop smoke tests wait for rendered theme changes and enabled,
  focused commit inputs, and replace amend messages through keyboard events so
  macOS WebKit and React observe the same edit.
- Unsigned CI installer builds retain the updater configuration with empty
  endpoints while disabling updater artifacts.

## [1.2.0] - 2026-10-28

### Changed

- Updated frontend dependencies, including lucide-react `1.61.0`,
  react-resizable-panels `4.15.0` and TanStack Virtual `3.14.23`, and upgraded
  Rust Tokio to `1.54.1`.
- Disabled legacy ZIP support in the Tauri updater, removing the ZIP dependency
  affected by RUSTSEC-2026-0367, RUSTSEC-2026-0368 and RUSTSEC-2026-0369 while
  retaining native v2 installer updates, Rustls TLS and system-proxy support.
- CI now cancels superseded runs on both pushes and pull requests, runs for
  non-Markdown changes under `docs/`, and no longer runs the Dependency Review
  job.
- SSH known-host hash tests now generate a random salt instead of using a
  hard-coded cryptographic fixture.
- Require the reusable CI quality checks before packaging releases.
- Use ad-hoc signing for macOS application bundles.
- Refresh the README and application branding.


### Fixed

- Added non-zero client dimensions to the jsdom test setup so virtualized lists
  render their rows in component tests.
- Corrected the app test's theme fixture and wrapped confirmation callbacks in
  React `act` so toolbar and staging tests wait for asynchronous state updates.

## [1.1.0] - 2026-10-16

### Added

- Live progress for network operations. Clone, fetch, pull and push now report
  their phase, transferred bytes and completion percentage, and can be cancelled
  mid-operation. Progress is shown in a dedicated panel at the app root, so an
  operation started from the welcome screen is visible too.
- Interactive Git prompts during network operations: HTTPS username/password
  (or token) prompts with retry feedback when the server rejects the credentials,
  and an SSH host-key confirmation that shows the OpenSSH `SHA256:…` fingerprint
  and records the key to `known_hosts` only when trusted.
- Secure storage for the GitHub token in the operating system's credential store
  (macOS Keychain, Windows Credential Manager, or the Linux Secret Service)
  instead of plaintext in `settings.json`.
- Commit signing now honors `gpg.format`, supporting OpenPGP, SSH and X.509
  signatures (including `ssh-keygen -Y sign` with a key file, an ssh-agent key,
  or a literal public key) and the configured `gpg.*.program`.
- Pull modes: pull now supports merge, rebase and fast-forward-only, falling back
  to the repository's `pull.rebase`/`pull.ff` settings, and refuses divergence
  with a clear message in fast-forward-only mode.
- Readable repository-state labels ("Rebasing", "Cherry-picking", …) in the status
  bar and the recent-repository list.
- Commit detail: the changed-file tree loads lazily per folder, and
  clicking a file opens the Compare view against the commit's parent (or the
  empty tree for a root commit).
- Optional passphrase support when generating an SSH key, with password fields in
  the shared prompt modal.

### Changed

- Push and pull now use the checked-out branch's real tracking ref: a branch is
  pushed to its actual upstream name, the first push sets the upstream like
  `git push -u`, force-with-lease verifies the genuine remote tip, and pushing or
  pulling on a detached HEAD is refused. The toolbar shows the exact
  `remote/branch` being synced.
- Diff handling now detects renames across staged, commit and compare diffs,
  reports `old_path` in status, diffs renamed files under their original path,
  and unstages a rename's source.
- Diff rendering caps file content at 5 MB per side and detects binary files,
  showing dedicated placeholders instead of loading them into the editor.
- Blame maps uncommitted working-tree edits so changed lines are no longer
  attributed to the wrong commit.
- Rebase preserves the full original commit messages, keeps squash/reword bodies
  as Git does, excludes merge commits from the plan, and matches `--autosquash`
  fixups by subject prefix like Git. In-progress rebases are re-derived from the
  repository state after a restart.
- Search uses `--fixed-strings` for commit/author queries (regex-looking input no
  longer errors) and stops at the match limit while streaming code search.
- The file watcher now reports whether refs moved, so the commit log reloads on a
  CLI commit/checkout/fetch but not on a plain file save; newly created top-level
  directories are watched.
- Refresh work is scoped to the parts an action can affect, the commit log is
  skipped when refs and graph filters are unchanged, and per-field tickets prevent
  overlapping refreshes from overwriting newer state.
- Tab switching snapshots and restores each tab's own state, so returning to a
  large repository no longer flashes empty.
- The conflict banner is operation-aware, classifying rebase/cherry-pick/revert/
  merge states, routing Abort to the correct backend and offering to open the
  rebase editor.
- Amending a commit loads its full message and only overwrites fields the user
  has not started editing, so commit bodies are no longer silently dropped.
- Commit list rows use a single roving tab stop for keyboard navigation; the graph
  draws edges that cross the viewport and hides while a sort or filter is applied.
- External links open through the Tauri opener plugin (the system browser) instead
  of `window.open`.
- Static inline styles and raw font sizes were migrated onto shared CSS classes
  and design tokens across the app, including a shared tool-modal stylesheet for
  the Git Doctor, worktree, submodule and branch-sweeper dialogs.
- Dependency upgrades: Tauri `2.12.4` and its plugins, React `19.3.1`, Vite
  `8.3.4`, Vitest `5.0.5`, Monaco `0.57.0`, lucide-react `1.58.0`, Radix UI and
  TanStack packages. Added the `opener` plugin and the `keyring` crate.
- The production build now typechecks with a dedicated `tsconfig.app.json`, Rust
  `tokio` was trimmed to `rt` + `macros`, and Tauri capabilities were reduced.
- Added V8 test coverage tooling and a `test:coverage` script, plus extensive new
  unit and component test suites.

### Fixed

- The stored GitHub token is now actually applied to HTTPS `github.com` remotes.
- Conflict resolution is binary-safe, handles a deleted side, and discarding
  changes refuses unresolved conflicted files instead of deleting them.
- Aborting during a rebase correctly runs the rebase abort rather than
  `git merge --abort`.
- Pushing or pulling on a detached HEAD no longer creates a spurious
  `refs/heads/HEAD` branch.
- A branch tracking another remote/branch no longer syncs the wrong ref.
- Ref-moving watcher events (CLI commit/checkout/fetch) no longer leave the graph
  stale, and plain saves no longer trigger a needless log reload.
- Overlapping refreshes can no longer let an older response overwrite newer status
  or clear the refreshing indicator early.
- External links ("Open on GitHub", autolinked references) now work.
- Amending from the subject line alone no longer drops the commit body.
- Clicking a file in a commit opens that commit's change instead of the working
  tree diff, and renamed files are no longer shown as wholly added.
- Signature lookups while arrowing quickly through the log no longer badge the
  current commit with an earlier result.
- Binary and oversized files are no longer passed to the editor, and resolving a
  conflict side no longer writes an empty file when one side was deleted.
- `apply_patch` ignores `/dev/null` placeholders, staging untracked files no
  longer fails validation, and Windows root/prefix paths are rejected.
- External merge tool scratch directories are always cleaned up.
- Staged rename diffs no longer show a file twice or under the wrong name.
- Commit-list skeletons no longer imply a search that was never run.
- CI status colors and semantic text-color classes render correctly.

### Removed

- The GitHub token from `settings.json` (now stored in the OS credential store,
  with `hasGithubPat` exposed instead).
- The `rebase_write_todo` command and its unused on-disk `basilico-rebase-plan.json`
  sidecar.
- The `dialog:allow-open`, `dialog:allow-save` and `dialog:allow-message` Tauri
  capability permissions.
- The "under construction" view fallback and the `diff` active view; every view is
  now handled.
- Dead UI state (`sidebarWidth`, `detailPanelVisible`, `detailPanelHeight`,
  `vimModeActiveArea`), the unused `reword` rebase status (now `edit`), and the
  `"copied"` file-status variant.

## [1.0.0] - 2026-09-24

### Added

- First implementation of Basilico.
