# 0010: Failures are `Result`, bugs panic; locks are `parking_lot`; `catch_unwind` only where third-party parsers read user files

A failure that can happen is a `Result`, and `?` carries it up. Examples are a missing file, a lost device, a corrupt database, or bad input. A bug panics. Examples are a broken invariant or an out-of-range index. The code does not add a type, a `Result` or `Option` return, an error variant, or a validation step only to express a bug. See [the coding standards](../coding-standards.md#errors-and-panics).

`as` stays allowed for numbers.

`catch_unwind` stays in exactly three places, where a third-party parser reads a user file that may be malformed:

- per-file inspection in the library scan
- the decode thread
- waveform analysis

`panic = "abort"` is not set, because it would disable these three boundaries.

Locks are `parking_lot` `Mutex`, `RwLock`, and `Condvar`. They do not poison, so a lock call does not return a `Result`.

An error that crosses the IPC boundary is a plain code enum: `Copy`, `Eq`, and serialized (see [ADR 0007](0007-failures-are-typed-exceptions-caught-in-three-places.md)). It carries no cause, because a cause such as `io::Error` is not `Clone` or `Eq`. The cause is logged where the code is made, with `map_err(logged(code, "context"))`. An error that already carries a cause derives `thiserror::Error`. The crate does not use `anyhow`, because it erases the type.

Reason: a bug must stop the code that has it, so the bug shows up where it is written. The earlier rule forced helper modules, `Result<_, ()>` plumbing, and silent clamps, and those hid off-by-one bugs. The Backend plays audio and holds the library. A bad user file must not stop the app, so the three `catch_unwind` boundaries stay.

Rejected:

- Keeping the no-panic rule. It forces helper modules, `Result<_, ()>` plumbing, and silent clamps that hide off-by-one bugs.
- `panic = "abort"`. It disables the three `catch_unwind` boundaries.
