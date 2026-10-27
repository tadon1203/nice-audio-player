# Coding standards

General best practice for Rust, TypeScript, and Svelte 5 takes precedence over this project's docs and code. If a rule here conflicts with general best practice, change the rule. Do not follow the conflicting rule.

These rules cover code and documentation that lint cannot check. Do not write a rule here if a lint or format tool enforces it. The tool configuration is the source of truth for those rules.

## All code and documentation

- Write comments and documentation in English. Follow ASD-STE100 (Simplified Technical English).
- Use the terms in [CONTEXT.md](../CONTEXT.md). Do not use synonyms.
- Documentation is the single source of truth. Keep each fact in one file. Link to it. Do not copy it.
- The lock file of each package manager locks the dependency versions. Use `=` only for a prerelease.

## Principles

- A Command changes state. It answers at once, with `Ok` or with an Error code. A Query reads data. It changes nothing. Neither one answers with Backend state. The Backend pushes that state. See [Invariants](../ARCHITECTURE.md#invariants).
- Each Backend state has one owner thread. The owner holds the state. It sends the whole value when the value changes. No other thread reads the state back.
- Remove a forwarding layer. A forwarding layer is a function, class, or module that only passes its arguments on.
- Do not add a trait or interface that has one real implementation. A seam is real only when something varies across it.
- Do not add a seam that only tests use. The exception is a seam at a hardware or operating-system boundary, such as the output device.
- Put a class or file that has one caller into that caller. Do this unless it adds something that the caller does not have.
- Do not write a static-only class. Write plain functions.
- Do not write a wrapper type that only copies fields.
- Do not write a mode or boolean argument that tells callers apart. Write one function for each case.
- Do not validate data that the program itself produced. See [Errors and panics](#errors-and-panics).
- Clamp a value in one place. Do not clamp it in several layers.
- Do not write a fallback that hides a bug.
- Do not retry a failure that a later user action recovers.
- A Command with nothing to do does nothing and succeeds. The Renderer disables controls from the pushed state.

## Naming

Casing and conversion names follow the standards below. The Rust compiler lints enforce Rust casing. TypeScript has no naming lint, so the rules here apply.

- Rust: [Rust API Guidelines, Naming](https://rust-lang.github.io/api-guidelines/naming.html). This includes `as_`, `to_`, and `into_`, `iter`, `iter_mut`, and `into_iter`. Use one word order across the crate: `ParseAddrError`, not `AddrParseError`.
- TypeScript: [Google TypeScript Style Guide, Naming](https://google.github.io/styleguide/tsguide.html). Use `UpperCamelCase` for classes, interfaces, types, and enums. Use `lowerCamelCase` for values and members. Use `CONSTANT_CASE` for module-level constants. Do not prefix an interface with `I`.
- Write an acronym as one word: `Id`, `Url`, `Http`, `Uuid`.

### Plain names

- A name is plain. It states what the thing is, with a noun. A function name states what the function does, with a verb. Do not use a metaphor or a clever word. The terms in [CONTEXT.md](../CONTEXT.md) are the plain names of the project.
- A name says what it handles. A role word alone (`Manager`, `Handler`, `Data`, `Info`) says nothing. Two vague words together (`DataInfo`) say nothing too. Put a specific noun before the role word: `ScanWorker`, `TrackRow`, `PackageInfo`.
- One concept has one name in every layer: the Backend module, the Host command file, the Renderer directory, and the type. That name is the term in [CONTEXT.md](../CONTEXT.md). One word has one meaning. Do not make a synonym.
- Name a local variable after its type, in lower case. `GlobalState` becomes `global_state`.
- Abbreviate only a word that everyone knows: `id`, `url`, `db`. Write every other word in full.
- Do not put the type in a name. Write `tracks`, not `track_list`.

| Plain                            | Not plain             |
| -------------------------------- | --------------------- |
| `queue`, `tracks`                | `lineup`, `track_vec` |
| `scan_library`, `load_track`     | `crawl`, `kick_off`   |
| `player_state` (a `PlayerState`) | `ps`, `st`, `current` |
| `position`                       | `pos`, `idx`          |

### Functions and members

- A read of many items is `list_<items>`. A read of one item is the noun. Do not use a `get_` prefix in Rust.
- In TypeScript, write a plain read as a property, a `get x()` accessor, or a function named with a noun. Do not write `getX()`.
- A boolean named `is_`, `has_`, or `can_` is clear. Use the prefix when the bare name is not clear (`next: bool`). A bare name that reads as a state (`muted`, `paused`) is allowed. So is the name of an HTML attribute (`disabled`, `pressed`).
- A callback prop is `on` plus the event name, in lower case: `onplaytrack`, `onsortchange`. The name matches the DOM events. An `on` attribute on an element is a DOM event listener. Never write its name in camel case.
- A private member of a TypeScript class uses `#`, not an underscore.

## Files

- One file has one concept: one responsibility inside an area. Name the file after the feature, with a noun or a verb phrase.
- There is no line limit. About 1,000 production lines is a guide.
- A file of about 150 lines or less, with one caller, goes into its caller.
- Do not make a directory with one file, or with only `mod.rs`.
- TypeScript and Svelte files use kebab-case. Import a component with a PascalCase name. A module that uses runes ends in `.svelte.ts`.
- Rust files use `snake_case.rs`. A module uses `foo.rs` next to `foo/`. Do not use `mod.rs`.

### Backend file layout

- The `backend/src` root holds only `app`, `library`, and `player`. It also holds the shared base modules: `ids`, `messages`, `settings`, `threads`, `errors`, and `test_support`.
- A domain module is `<name>.rs` with a `<name>/` directory beside it.
- Tests sit beside the lowest module whose public surface they call. They go in `tests.rs` with a `tests/` directory.
- A dependency never points from a lower module to the module above it. For example, `player/audio` does not import `player/worker` or `player/playback`. A type that two sibling modules share goes in the `types.rs` of their parent, such as `player/types.rs`.

## Errors and panics

- A failure that can happen is a `Result`. Examples: a missing file, a lost device, a corrupt database, bad input.
- A bug panics. Examples: a broken invariant, an out-of-range index.
- Use `expect` only for an invariant that the types cannot show. Or use it for a failure at start-up. The message says why the call cannot fail. A message that only names the call is not a reason.
- Use plain indexing where an out-of-range index is a bug.
- Do not add a type, a `Result` or `Option` return, an error variant, or a validation step that only expresses a failure that would be a bug.
- Validate data once, where it enters the program. Input comes from other processes, files, databases, and the operating system. Pass the validated type inside the program. Trust it there.
- The Renderer throws no exception for a Backend failure. The native adapter returns a Result: `{ ok: true, value }` or `{ ok: false, error }`. A failed Command shows a notice. A failed Query shows the text of its Error code. An empty fallback is allowed only where an empty view is still correct. The Renderer chooses the user text from the Error code.
- Do not write `null` returns, `?.` chains, or `??` defaults for a value that cannot be missing.

## Rust

- Do not write `unreachable!`. Remove the impossible branch with the types. Split the enum, or carry a validated value.
- Each Backend domain has its own error type. It derives `thiserror::Error`. The domains are `LibraryError` and `PlayerError`. Do not write one error type that joins all domains.
- A variant of a domain error exists only for a branch that a caller matches, such as a missing item or a duplicate Library directory. Every other failure goes into one variant, `Internal(#[from] anyhow::Error)`, in each domain error type.
- Inside a domain, a failure that nobody matches uses `anyhow::Result` and `.context("...")`. A domain with no matched branch has no error type. It returns `anyhow::Result`.
- `PlayerError` has the variant `Library(#[from] LibraryError)`.
- An error enum that a module matches on for another reason, such as a decode, output, or pipeline error that maps to a playback failure code, stays an enum. It keeps its cause with `#[source]`.
- The methods of `BackendApp` return `anyhow::Result<T>`.
- `contain` turns a panic from a third-party parser into an `anyhow::Error`.
- The message of an error (`#[error("...")]`, `.context(...)`) is English diagnostic text for the log. The Backend never builds a string for the user. No table maps errors to text.
- Do not re-map an error on the way up. Keep its cause with `?`, `#[from]`, or `#[source]`.
- All Host code (`src-tauri`) uses `anyhow::Result`. Do not use `expect` or `unwrap` for a failure that can happen. Do not write an `if let Err` that swallows an error. Return the error with `?` and `.context(..)` up to `main`, which exits the process.
- One small wrapper at the Host command boundary converts an `anyhow::Error` into a `CommandError`, which holds only a code. It finds the code by downcasting to the domain error types. Every other failure has the code `internal`. The wrapper logs the failure once, in this form: `host.command.failed code=<code> cause=<error chain, with {:#}>`. It logs at `warn` for `internal` and at `debug` for other codes. No other code logs a returned error.
- A failure that a worker handles is logged where the worker handles it. A `From` impl never logs.
- Do not write `let _ = <Result>`. Log the error, or handle it. The exception is a send to a channel whose receiver may be gone: write `let _ = sender.send(..);` with no log.
- A thread that the OS cannot start panics. Use `expect` and give the reason.
- A cause with no `Display` is logged inline with its `Debug` form. A thread's `join` returns a panic payload that has no `Display`. Check `join().is_err()`, and log it at `debug`.
- Remove a file on a best-effort basis. Log every error except "not found".
- Lock a `Mutex`, `RwLock`, or `Condvar` with `parking_lot`.
- Code that runs in a real-time callback does not log, allocate, lock, panic, or do I/O. A function that must not allocate takes `&mut [T]` from its caller. It writes into that slice.
- `as` is allowed for a number. Where the value may not fit, use `From` or `TryFrom`. Then the conversion cannot change the value without a signal.
- Use `checked_*` or `saturating_*` for arithmetic that can overflow.
- Use `dyn` only at a real seam, such as an output callback or an event listener.
- Hold an ID, not a long-lived reference, across a thread boundary. Pass a value across a thread with `Arc` or with a channel.
- Add a lint suppression only when the user agrees. Every `allow` in `[workspace.lints]` has a comment that gives the reason.

## Frontend

- The frontend is object-oriented by default. A state with rules is a class with `$state` fields. A pure calculation is a plain function.
- A class gets its dependencies as constructor arguments.
- Presentational components do not import application logic. Pass a value, such as reduced motion, as an argument.
- Do not write `create…` factories.
- Do not use the `private` keyword. Use `#` for private members.
- Put one public class in each file. The file name is the class name in kebab-case.
- Pass members to the template directly only as arrow-function fields.
- Construct a class that uses `$effect` during component initialization. Do not use `$effect.root`.
- Share state with a class that has `$state` fields. Provide it with `createContext`. Do not use a store or a module-level singleton. Context limits the state to the part of the app that needs it. `createContext` is type-safe. `setContext` and `getContext` are not.
- Import another module only through its public entry file. Do not import its inner files. The entry file is the public surface of the module. The inner files can move without a change in the callers.
- Inside a module, import sibling files with a relative path. Never import the module's own entry file. That causes a circular import.

### Svelte 5 patterns

Source: the Svelte documentation, "Best practices" and "When not to use `$effect`".

- Use `$state` only for a value that must trigger an update. Keep every other value a plain variable.
- Use `$state.raw` for a large value that is only reassigned, such as an API response.
- Compute a value from other state with `$derived`. Do not update state in `$effect`. Use `$derived`, an event handler, or a function binding.
- Treat a prop as a value that can change. Derive a value from a prop with `$derived`.
- Use an effect last. Use the first option that fits: an attachment (`{@attach}`) to sync an external library, an event handler or a function binding for user action, or `$inspect` for debugging.
- Do not wrap an effect in a browser check. Effects do not run on the server.
- Attach a `window` or `document` listener with `<svelte:window>` or `<svelte:document>`. Do not use `onMount` or `$effect` for it.
- Use `$inspect.trace(label)` to find the dependency that caused an unexpected update.
- Use a keyed `{#each}` block. Do not destructure an item that you mutate, such as `bind:value={item.count}`.
- Use `{#key}` sparingly. It unmounts all of its content on each change. To re-run logic in a child, use `$derived` in the child.
- Pass a JavaScript value to CSS with `style:--name`. Style a child with a CSS custom property. Use `:global` only when the child cannot be changed.
- Use runes mode for all new code. Do not write `$:`, `export let`, `$$props`, `on:` directives, `<slot>`, `<svelte:component>`, or `<svelte:self>`. Use these instead: `$derived` and `$effect`, `$props`, `onclick`, snippets with `{@render}`, a dynamic component name, an import of the component itself, and `{@attach}`.

## Tests

- Test through the public interface. Do not test private members.
- Replace a dependency only at a real seam. The real seams are: a generated bindings module, a trait or interface with more than one implementation, and globals such as timers and animation frames. Use stubs and fake timers for globals. Do not replace an internal collaborator.
- Keep unit tests of a pure function next to the function.

### Backend tests

- A test of one small function stays in its file, in `#[cfg(test)] mod tests`.
- A test of a module's behavior goes in a separate test file for that module. Split it into several files only above about 1,000 lines.

### End-to-end tests

- Find regions by `aria-label` or role with CSS. Narrow from the page to the element: `$(scope).$(…)`.
- Use a text selector only as the last step of a chain. Do not mix strategies in one selector string.
- Add `data-testid` only where no accessible name exists.
- Test through the user-visible interface. Do not use framework or driver internals.
