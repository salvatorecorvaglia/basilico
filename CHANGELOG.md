# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Updated frontend dependencies, including lucide-react `1.59.0`,
  react-resizable-panels `4.14.6` and TanStack Virtual `3.14.21`, and upgraded
  Rust Tokio to `1.54.0`.
- Disabled legacy ZIP support in the Tauri updater, removing the ZIP dependency
  affected by RUSTSEC-2026-0367, RUSTSEC-2026-0368 and RUSTSEC-2026-0369 while
  retaining native v2 installer updates, Rustls TLS and system-proxy support.
- CI now cancels superseded runs on both pushes and pull requests, runs for
  non-Markdown changes under `docs/`, and no longer runs the Dependency Review
  job.
- SSH known-host hash tests now generate a random salt instead of using a
  hard-coded cryptographic fixture.

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
