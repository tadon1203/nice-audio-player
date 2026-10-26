# Coding standards

General best practice for Rust, TypeScript, and Svelte 5 overrides this project's docs and code. If a rule here conflicts with general best practice, change the rule. Do not follow the conflicting rule.

These are the rules for code and documentation that lint cannot check. Do not write a rule here if a lint or format tool enforces it. The tool configuration is the source of truth for those rules.

## All code and documentation

- Write comments and documentation in English. Follow ASD-STE100 (Simplified Technical English).
- Use the terms in [CONTEXT.md](../CONTEXT.md), not synonyms.
- Documentation is the single source of truth. Keep each fact in one file. Link; do not copy.
- Dependency versions are locked by the lock file of each package manager. Use `=` only for a prerelease.

## Principles

- A Command changes state and answers only whether it was accepted. A Query reads data and changes nothing. Neither answers with Backend state, which the Backend pushes.
- Each Backend state has one owner thread. It holds the state, sends the whole value when the value changes, and no other thread reads the state back.
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

## Naming

Casing and conversion names follow the standards below. Rust casing is enforced by the compiler lints. TypeScript has no naming lint, so the rules here apply.

- Rust: [Rust API Guidelines, Naming](https://rust-lang.github.io/api-guidelines/naming.html). This includes `as_`, `to_`, and `into_`, `iter`, `iter_mut`, and `into_iter`, and one word order across the crate (`ParseAddrError`, not `AddrParseError`).
- TypeScript: [Google TypeScript Style Guide, Naming](https://google.github.io/styleguide/tsguide.html). `UpperCamelCase` for classes, interfaces, types, and enums. `lowerCamelCase` for values and members. `CONSTANT_CASE` for module-level constants. Do not prefix an interface with `I`.
- Write an acronym as a word: `Id`, `Url`, `Http`, `Uuid`.

### Plain names

- A name is plain. It says what the thing is, with a noun. A function name says what it does, with a verb. Do not use a metaphor or a clever word. The terms in [CONTEXT.md](../CONTEXT.md) are the plain names of the project.
- A name says what it handles. A role word alone (`Manager`, `Handler`, `Data`, `Info`) or two vague words together (`DataInfo`) says nothing. Put a specific noun before a role word: `ScanWorker`, `TrackRow`, `PackageInfo`.
- One concept has one name in every layer: the Backend module, the Host command file, the Renderer directory, and the type. That name is the term of [CONTEXT.md](../CONTEXT.md). One word has one meaning. Do not make a synonym.
- A local variable is named after its type, in lower case: `GlobalState` is `global_state`.
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
- A boolean named `is_`, `has_`, or `can_` is clear. Use the prefix when the bare name is not clear (`next: bool`). A bare name that reads as a state (`muted`, `paused`) and the name of an HTML attribute (`disabled`, `pressed`) are allowed.
- A callback prop is `on` plus the event name, in lower case: `onplaytrack`, `onsortchange`. The name matches DOM events. An `on` attribute on an element is a DOM event listener, and a name in camel case is never called.
- A private member of a TypeScript class uses `#`, not an underscore.

## Files

- One file has one concept: one responsibility inside an area. Name the file after the feature, with a noun or a verb phrase.
- There is no line limit. About 1,000 production lines is a guide.
- A file of about 150 lines or less with one caller goes into its caller.
- Do not make a directory with one file, or with only `mod.rs`.
- TypeScript and Svelte files use kebab-case. A component is imported with a PascalCase name. A module that uses runes ends in `.svelte.ts`.
- Rust files use `snake_case.rs`. A module uses `foo.rs` next to `foo/`. Do not use `mod.rs`.

## Errors and panics

- A failure that can happen is a `Result`. Examples: a missing file, a lost device, a corrupt database, bad input.
- A bug panics. Examples: a broken invariant, an out-of-range index.
- Use `expect` only for an invariant that the types cannot show, or for a failure at start-up. The message says why the call cannot fail. A message that only names the call is not a reason.
- Use plain indexing where an out-of-range index is a bug.
- Do not add a type, a `Result` or `Option` return, an error variant, or a validation step only to express a failure that would be a bug.
- Validate once where data enters the program: input from other processes, files, databases, and the operating system. Pass the validated type inside, and trust it.
- In TypeScript, a failure is a typed exception. Do not write `null` returns, `?.` chains, or `??` defaults for a value that cannot be missing.

## Rust

- Do not write `unreachable!`. Remove the impossible branch with the types: split the enum, or carry a validated value.
- Write an error as an enum with `#[derive(thiserror::Error)]` when it carries a cause. Do not use `anyhow`.
- Log a failure once, where it is handled. Log the cause at `warn` when it maps to a typed error, and at `debug` when the caller drops it.
- Do not write `let _ = <Result>`. Log the error, or handle it.
- A cause with no `Display` is logged inline with its `Debug` form. A thread's `join` returns a panic payload that has no `Display`: check `join().is_err()` and log it at `debug`.
- Remove a file on a best-effort basis. Log every error except "not found".
- Lock a `Mutex`, `RwLock`, or `Condvar` with `parking_lot`.
- Code that runs in a real-time callback does not log, allocate, lock, panic, or do I/O. A function that must not allocate takes `&mut [T]` from the caller and writes into it.
- `as` is allowed for a number. Use `From` or `TryFrom` where the value may not fit, so the conversion cannot silently change it.
- Use `checked_*` or `saturating_*` for arithmetic that can overflow.
- Use `dyn` only at a real seam, such as an output callback or an event listener.
- Hold an ID, not a long-lived reference, across a thread boundary. Pass a value across a thread by `Arc` or by a channel.
- Add a lint suppression only when the user agrees. Every `allow` in `[workspace.lints]` has a comment that gives the reason.

## Frontend

- The frontend is object-oriented by default. A state with rules is a class with `$state` fields. A pure calculation is a plain function.
- A class gets its dependencies as constructor arguments.
- Presentational components do not import application logic. Pass a value such as reduced motion as an argument.
- Do not write `create…` factories.
- Do not use the `private` keyword. Use `#` for private members.
- Put one public class in each file. The file name is the class name in kebab-case.
- Pass members to the template directly only as arrow-function fields.
- Construct a class that uses `$effect` during component initialization. Do not use `$effect.root`.
- Share state with a class that has `$state` fields, provided through `createContext`. Do not use a store or a module-level singleton. Context scopes the state to the part of the app that needs it, and `createContext` is type-safe where `setContext` and `getContext` are not.
- Import another module only through its public entry file. Do not import its inner files. The entry file is the public surface of the module, so the inner files can move without a change in the callers.
- Inside a module, import the sibling files directly, with a relative path. Never import the module's own entry file. That causes a circular import.

### Svelte 5 patterns

Source: the Svelte documentation, "Best practices" and "When not to use `$effect`".

- Use `$state` only for a value that must trigger an update. Keep every other value a plain variable.
- Use `$state.raw` for a large value that is only reassigned, such as an API response.
- Compute a value from other state with `$derived`. Do not update state in `$effect`. Use `$derived`, an event handler, or a function binding.
- Treat a prop as changing. Derive a value from a prop with `$derived`.
- Use an effect last. Use the first option that fits: an attachment (`{@attach}`) to sync an external library, an event handler or a function binding for user action, and `$inspect` for debugging.
- Do not wrap an effect in a browser check. Effects do not run on the server.
- Attach a `window` or `document` listener with `<svelte:window>` or `<svelte:document>`. Do not use `onMount` or `$effect` for it.
- Use `$inspect.trace(label)` to find the dependency that caused an unexpected update.
- Use a keyed `{#each}` block. Do not destructure an item that you mutate, such as `bind:value={item.count}`.
- Use `{#key}` sparingly. It unmounts all of its content on each change. To re-run logic in a child, use `$derived` in the child.
- Pass a JavaScript value to CSS with `style:--name`. Style a child with a CSS custom property. Use `:global` only when the child cannot be changed.
- Use runes mode for all new code. Do not write `$:`, `export let`, `$$props`, `on:` directives, `<slot>`, `<svelte:component>`, or `<svelte:self>`. Use `$derived` and `$effect`, `$props`, `onclick`, snippets with `{@render}`, a dynamic component name, an import of the component itself, and `{@attach}` instead.

## Tests

- Test through the public interface. Do not test private members.
- Replace a dependency only at a real seam: a generated bindings module, a trait or interface with more than one implementation, and globals (timers, animation frames) through stubs and fake timers. Do not replace an internal collaborator.
- Keep unit tests of a pure function next to the function.

### Backend tests

- A test of one small function stays in its file, in `#[cfg(test)] mod tests`.
- A test of a module's behavior goes in a separate test file for that module. Split it into several files only above about 1,000 lines.

### End-to-end tests

- Find regions by `aria-label` or role with CSS. Narrow from page to element: `$(scope).$(…)`.
- Use a text selector only as the final step of a chain. Do not mix strategies in one selector string.
- Add `data-testid` only where no accessible name exists.
- Test through the user-visible interface. Do not use framework or driver internals.
