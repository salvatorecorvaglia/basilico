# GTK 0.18 security backports

These are crates.io sources of glib 0.18.5, with the original MIT license
retained. Tauri 2's GTK3 stack requires this API family;
forcing GLib 0.20+ would introduce incompatible types.

Original crates.io archive SHA-256: `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`.
Only `src/variant_iter.rs` differs from the unpacked crate sources; Cargo
registry bookkeeping files are omitted.

Local changes:

- `glib/src/variant_iter.rs`: backport the out-pointer mutability fix described
  in RUSTSEC-2024-0429 and gtk-rs/gtk-rs-core#1343. The variadic C function
  receives `&mut p`, and `p` is mutable. This prevents undefined behavior and
  optimizer-induced null dereferences when iterating string arrays.

Source versions and dependency replacements are recorded in Cargo.lock.
`tests/glib_backport_test.rs` exercises forward, reverse, nth and last string
iteration on Linux. The main backend suite runs it in debug mode; use
`cargo test --locked --release --manifest-path tests/desktop/glib-check/Cargo.toml`
for an isolated optimized run without linking an entire Tauri release. Both
modes and the full Linux GTK/Tauri build must pass when updating the patch.

Remove these overrides when the supported Tauri stack ships compatible fixes.
Do not treat a local patch as an upstream advisory resolution, and do not add
an advisory ignore to hide an unverified fix.

References:
- https://rustsec.org/advisories/RUSTSEC-2024-0429.html
- https://github.com/gtk-rs/gtk-rs-core/pull/1343
