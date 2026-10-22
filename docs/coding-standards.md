# Coding standards

General best practice for Rust, TypeScript, and Svelte 5 overrides this project's docs, ADRs, and code. If a rule here conflicts with general best practice, change the rule. Do not follow the conflicting rule.

These are the rules for code and documentation that lint cannot check. Do not write a rule here if a lint or format tool enforces it. The tool configuration is the source of truth for those rules. The reasons are in the ADRs that each rule links.

## All code and documentation

- Write comments and documentation in English. Follow ASD-STE100 (Simplified Technical English).
- Use the terms in [CONTEXT.md](../CONTEXT.md), not synonyms.
- Documentation is the single source of truth. Keep each fact in one file. Link; do not copy.

## Principles

- Remove a forwarding layer: a function, class, or module that only passes its arguments on.
- Do not add a trait or interface with one real implementation. A seam is real only when something varies across it.
- Do not add a seam that only tests use.
- Put a class or file with one caller into its caller, unless it adds something that the caller does not have.
- Do not write a static-only class. Write plain functions.
- Do not write a wrapper type that only copies fields.
- Do not write a mode or boolean argument that tells callers apart. Write one function for each case.
- Do not validate data that the program itself produced. See [Errors and panics](#errors-and-panics).
- Clamp a value in one place, not in several layers.
- Do not write a fallback that hides a bug.
- Do not retry a failure that a later user action recovers.

These user-facing robustness behaviors stay:

- output device loss
- native-format fallback
- decode failure skips the track
- lyrics encoding detection
- a damaged settings file does not stop start-up
- stale async results are dropped by id

## Naming

- Use plain nouns. Do not use these words in a name: `Service`, `Repository`, `Manager`, `Handle`, `Hub`, `Snapshot`, `Summary`, `Center`, `Runner`, `Base`, `Sink`, `Commands`.
- Use `XxxState` only for Backend state.
- Use `XxxWorker` only for a thread that owns a command loop.
- One operation has one name in every layer: a Host command is `<area>_<method>`, a Backend method is `<method>` on the area object, and a Renderer method is `<method>` on the area class.
- A read of many items is `list_<items>`. A read of one item is the noun. Do not use a `get_` prefix in Rust.
- Command prefixes are `player`, `library`, `lyrics`, `meter`, `appearance`, and `app`.
- A word has one meaning.

## Files

- One file has one concept: one responsibility inside an area.
- There is no line limit. About 1,000 production lines is a guide.
- A file of about 150 lines or less with one caller goes into its caller.
- Do not make a directory with one file, or with only `mod.rs`.
- Rust modules use `foo.rs` next to `foo/`. Do not use `mod.rs`.

## Errors and panics

- A failure that can happen is a `Result`. Examples: a missing file, a lost device, a corrupt database, bad input.
- A bug panics. Examples: a broken invariant, an out-of-range index.
- Use `expect("why")` for an invariant. Use plain indexing where an out-of-range index is a bug.
- Do not add a type, a `Result` or `Option` return, an error variant, or a validation step only to express a failure that would be a bug.
- Validate once where data enters the program: IPC input, files, the database, and the OS. Trust the data after that.
- TypeScript follows the same rule. Do not write `null` returns, `?.` chains, or `??` defaults for a value that cannot be missing.
- See [ADR 0010](adr/0010-failures-are-result-bugs-panic.md).

## Rust

The rules below are the ones that lint cannot check.

### Failures and logging

- Use `expect` only for an invariant that the types cannot show, or for a failure at start-up. The message says why the call cannot fail. A message that only names the call is not a reason.
- Do not write `unreachable!`. Remove the impossible branch with the types: split the enum, or carry a validated value.
- Validate once at the boundary, and pass the validated type inside.
- Write an error as an enum with `#[derive(thiserror::Error)]` when it carries a cause. Do not use `anyhow`.
- Map an error cause with `logged`: `.map_err(logged(Code, "area.what"))`. It logs the cause at `warn` and returns the typed code.
- Drop a `Result` that has no caller with `log_failed(result, "area.what")` (`diagnostics.rs`). It logs an error at `debug` and returns nothing. Do not write `let _ = <Result>`. A `try_send` into a full channel of capacity 1 is not an error, because a wake is already pending.
- A cause with no `Display` (an IPC enum) is logged inline at `warn` with its `Debug` form, as in `library/store/playback.rs`. Code that runs in the audio callback does not log at all.
- Lock a `Mutex`, `RwLock`, or `Condvar` with `parking_lot`. See [ADR 0010](adr/0010-failures-are-result-bugs-panic.md).
- Answer a playback request through `respond` (`audio/playback/service.rs`). It sends the reply, and logs at `debug` when the caller has gone.
- Remove a file on a best-effort basis with `remove_file_best_effort` (`cleanup.rs`). It logs at `debug` every error except `NotFound`.
- A thread's `join` returns a panic payload, which has no `Display`. Check `join().is_err()` and log it at `debug`; `log_failed` cannot take it.
- `as` is allowed for a number. Use `From` or `TryFrom` where the value may not fit, so the conversion cannot silently change it.
- Use `checked_*` or `saturating_*` for arithmetic that can overflow.
- Add a lint suppression only when the user agrees.
- Every `allow` in `[workspace.lints]` has a comment that gives the reason.

### Generics, memory, and borrows

- Use `dyn` only at a real seam, such as an output callback or an event listener.
- A function that must not allocate takes `&mut [T]` from the caller and writes into it.
- The audio callback does not allocate, lock, panic, or do I/O.
- Hold an ID, not a long-lived reference, across a thread boundary. Pass a value across a thread by `Arc` or by a channel.

## Dependencies

- The app's dependency versions are locked by `Cargo.lock` and `pnpm-lock.yaml`. Use `=` only for a prerelease.

## Renderer

Design rules are in [ADR 0011](adr/0011-renderer-design.md):

- The Renderer is object-oriented by default. A state with rules is a class with `$state` fields.
- A pure calculation is a plain function.
- A class gets its dependencies as constructor arguments. A component gets them with `App.current()`.
- `ui/` never imports `app/`. Pass a value such as reduced motion as an argument.

Other rules:

- Do not write `create…` factories. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Do not use the `private` keyword. Use `#` for private members. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Put one public class in each file. The file name is the class name in kebab-case. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Pass members to the template directly only as arrow-function fields. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Construct a class that uses `$effect` during component initialization. Do not use `$effect.root`. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Do not update state in `$effect`. Use `$derived`, an event handler, or a function binding. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Failures are typed exceptions. See [ADR 0007](adr/0007-failures-are-typed-exceptions-caught-in-three-places.md).
- Share state between components with a class that has `$state` fields. Do not use a store. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Import another module only through its `index.ts` (the barrel). Do not import its inner files. The barrel is the public surface of the module, so the inner files can move without a change in the callers.
- Inside a module, import the sibling files directly, with a relative path. Never import the module's own barrel. That causes a circular import.
- Import icons one by one. Never import from the icon library barrel. The barrel slows the dev server and the E2E runs.

## Tests

- Test through the public interface. Do not test private members.
- Replace a dependency only at a real seam: the generated bindings module in the Renderer (`vi.mock`), the `OutputStream` trait in the Backend, and globals (`requestAnimationFrame`, timers) through stubs and fake timers.
- Do not replace an internal collaborator. Do not add a seam only so that a test can replace something. See [ADR 0011](adr/0011-renderer-design.md).
- Keep unit tests of a pure function next to the function.

### Backend tests

- A test of one small function stays in its file, in `#[cfg(test)] mod tests`.
- A test of a module's behavior goes in `<module>/tests.rs`, one file per seam. Split it into `<module>/tests/<behavior>.rs` only above about 1,000 lines.

### E2E tests (`tests-app/`)

- Find regions by `aria-label` or role with CSS. Narrow from page to element: `$(scope).$(…)`.
- Use a text selector only as the final step of a chain. Do not mix strategies in one selector string.
- Add `data-testid` only where no accessible name exists.
- Do not use Tauri or WebdriverIO internals.
