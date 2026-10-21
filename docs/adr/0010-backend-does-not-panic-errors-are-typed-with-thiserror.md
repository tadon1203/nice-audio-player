# 0010: The Backend does not panic, and its errors are typed with `thiserror`

Production Rust code does not panic. A failure is a `Result`, and `?` carries it up. Clippy enforces this with `unwrap_used`, `panic`, `todo`, `unimplemented`, `indexing_slicing`, `string_slice`, and the `pedantic` group, all at `warn`. `-D warnings` makes them errors. The lints are set in `[workspace.lints]`, and every `allow` there has a comment that gives the reason. Test code is exempt through `clippy.toml`, because a panic is how a test fails.

`expect_used` and `unreachable` are not enabled. `expect` stays for an invariant that the types cannot show, and for a failure at start-up. Lint cannot tell a proved `expect` from a lazy one, so [the coding standards](../coding-standards.md#rust) limit it, and the code review checks it. `unreachable` is off because `#[tauri::command]` generates about 80 false positives.

An error that crosses the IPC boundary is a plain code enum: `Copy`, `Eq`, and serialized (see [ADR 0007](0007-failures-are-typed-exceptions-caught-in-three-places.md)). It carries no cause, because a cause such as `io::Error` is not `Clone` or `Eq`. The cause is logged where the code is made, and `map_err_ignore` forces that: use `map_err(logged(code, "context"))`, not `map_err(|_| code)`. An error that already carries a cause, or that the logs print as `{error}`, derives `thiserror::Error`. The crate does not use `anyhow`: it erases the type.

Other lints enforce the rest of the rules. `as_conversions` bans `as` for numbers. `allow_attributes` and `allow_attributes_without_reason` force `#[expect(…, reason = "…")]`. `unsafe_code` is `deny`, with one `#[expect]` at the thread-priority call. `disallowed-methods` in `clippy.toml` bans `Mutex::lock` and `Condvar::wait` (use the shared helpers `sync::lock` and `sync::wait`, which hold the only `#[expect]`s) and `thread::spawn` (use a named `thread::Builder`).

Reason: the Backend plays audio and holds the library. A panic on one thread must not stop the sound or take the other threads down. Lint is the only check that does not depend on a reviewer's attention, so the rule is in the lint configuration.

Cost: about 50 indexing sites in production code become iterators, slice patterns, `chunks_exact`, or `.get()`. About 70 `as` casts go: the SQLite ones use the checked `u64` support of `rusqlite`, and the rest move into one module of checked conversions. The lints are enabled one by one, each in the ticket that fixes its last violation, so `main` stays green.

Rejected:

- `parking_lot` to remove `lock().unwrap()`. It adds a dependency, and a shared helper that recovers from poison does the same work.
- `arithmetic_side_effects`. About 100 production sites would need `checked_*` calls in the sample and position arithmetic, and the audio code would be hard to read. Review this after the other lints are in.
- `disallowed-types` for `HashMap` (to `FxHashMap`). The maps are small and local. A faster hasher is not worth a dependency.
- `disallowed-methods` for `Command::new`. Only two calls exist, both for `explorer.exe`.
