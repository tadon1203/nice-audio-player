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

## Naming

- Use plain nouns that say what the thing is. Each of them names a role, a pattern, a direction, or a group instead of the thing itself, so the name does not show what the thing is.
- A read of many items is `list_<items>`. A read of one item is the noun. Do not use a `get_` prefix in Rust.
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
- Validate once where data enters the program: input from other processes, files, databases, and the operating system. Trust the data after that.
- TypeScript follows the same rule. Do not write `null` returns, `?.` chains, or `??` defaults for a value that cannot be missing.
- See [ADR 0010](adr/0010-failures-are-result-bugs-panic.md).

## Rust

The rules below are the ones that lint cannot check.

### Failures and logging

- Use `expect` only for an invariant that the types cannot show, or for a failure at start-up. The message says why the call cannot fail. A message that only names the call is not a reason.
- Do not write `unreachable!`. Remove the impossible branch with the types: split the enum, or carry a validated value.
- Validate once at the boundary, and pass the validated type inside.
- Write an error as an enum with `#[derive(thiserror::Error)]` when it carries a cause. Do not use `anyhow`.
- Log a failure once, where it is handled. Log the cause at `warn` when it maps to a typed error, and at `debug` when the caller drops it.
- Do not write `let _ = <Result>`. Log the error, or handle it.
- A cause with no `Display` is logged inline with its `Debug` form.
- Code that runs in a real-time callback does not log, allocate, lock, or do I/O.
- Lock a `Mutex`, `RwLock`, or `Condvar` with `parking_lot`. See [ADR 0010](adr/0010-failures-are-result-bugs-panic.md).
- A thread's `join` returns a panic payload, which has no `Display`. Check `join().is_err()` and log it at `debug`.
- Remove a file on a best-effort basis. Log every error except "not found".
- `as` is allowed for a number. Use `From` or `TryFrom` where the value may not fit, so the conversion cannot silently change it.
- Use `checked_*` or `saturating_*` for arithmetic that can overflow.
- Add a lint suppression only when the user agrees.
- Every `allow` in `[workspace.lints]` has a comment that gives the reason.

### Generics, memory, and borrows

- Use `dyn` only at a real seam, such as an output callback or an event listener.
- A function that must not allocate takes `&mut [T]` from the caller and writes into it.
- A real-time callback does not allocate, lock, panic, or do I/O.
- Hold an ID, not a long-lived reference, across a thread boundary. Pass a value across a thread by `Arc` or by a channel.

## Dependencies

- Dependency versions are locked by the lock file of each package manager. Use `=` only for a prerelease.

## Frontend

Design rules are in [ADR 0011](adr/0011-renderer-design.md):

- The frontend is object-oriented by default. A state with rules is a class with `$state` fields.
- A pure calculation is a plain function.
- A class gets its dependencies as constructor arguments.
- Presentational components do not import application logic. Pass a value such as reduced motion as an argument.

Other rules:

- Do not write `create…` factories. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Do not use the `private` keyword. Use `#` for private members. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Put one public class in each file. The file name is the class name in kebab-case. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Pass members to the template directly only as arrow-function fields. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Construct a class that uses `$effect` during component initialization. Do not use `$effect.root`. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Do not update state in `$effect`. Use `$derived`, an event handler, or a function binding. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Failures are typed exceptions. See [ADR 0007](adr/0007-failures-are-typed-exceptions-caught-in-three-places.md).
- Share state between components with a class that has `$state` fields. Do not use a store. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Import another module only through its public entry file. Do not import its inner files. The entry file is the public surface of the module, so the inner files can move without a change in the callers.
- Inside a module, import the sibling files directly, with a relative path. Never import the module's own entry file. That causes a circular import.

### Svelte 5 patterns

Source: the Svelte documentation, "Best practices" and "When not to use `$effect`".

- Use `$state` only for a value that must trigger an update. Keep every other value a plain variable.
- Use `$state.raw` for a large value that is only reassigned, such as an API response.
- Compute a value from other state with `$derived`. Do not assign it inside `$effect`.
- Treat a prop as changing. Derive a value from a prop with `$derived`.
- Use an effect last. Use the first option that fits: an attachment (`{@attach}`) to sync an external library, an event handler or a function binding for user action, and `$inspect` for debugging.
- Do not wrap an effect in a browser check. Effects do not run on the server.
- Attach a `window` or `document` listener with `<svelte:window>` or `<svelte:document>`. Do not use `onMount` or `$effect` for it.
- Use `$inspect.trace(label)` to find the dependency that caused an unexpected update.
- Use a keyed `{#each}` block. Do not destructure an item that you mutate, such as `bind:value={item.count}`.
- Use `{#key}` sparingly. It unmounts all of its content on each change. To re-run logic in a child, use `$derived` in the child.
- Pass a JavaScript value to CSS with `style:--name`. Style a child with a CSS custom property. Use `:global` only when the child cannot be changed.
- Share state through a class instance that a `createContext` provides, not through a module-level singleton. Context scopes the state to the part of the app that needs it. Use `createContext`, not `setContext` and `getContext`, for type safety.
- Use runes mode for all new code. Do not write `$:`, `export let`, `$$props`, `on:` directives, `<slot>`, `<svelte:component>`, or `<svelte:self>`. Use `$derived` and `$effect`, `$props`, `onclick`, snippets with `{@render}`, a dynamic component name, an import of the component itself, and `{@attach}` instead.

## Tests

- Test through the public interface. Do not test private members.
- Replace a dependency only at a real seam: a generated bindings module, a trait or interface with more than one implementation, and globals (timers, animation frames) through stubs and fake timers.
- Do not replace an internal collaborator. Do not add a seam only so that a test can replace something. See [ADR 0011](adr/0011-renderer-design.md).
- Keep unit tests of a pure function next to the function.

### Backend tests

- A test of one small function stays in its file, in `#[cfg(test)] mod tests`.
- A test of a module's behavior goes in a separate test file for that module. Split it into several files only above about 1,000 lines.

### End-to-end tests

- Find regions by `aria-label` or role with CSS. Narrow from page to element: `$(scope).$(…)`.
- Use a text selector only as the final step of a chain. Do not mix strategies in one selector string.
- Add `data-testid` only where no accessible name exists.
- Test through the user-visible interface. Do not use framework or driver internals.
