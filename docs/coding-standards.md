# Coding standards

These are the rules for code and documentation that lint cannot check. Do not write a rule here if a lint or format tool enforces it. The tool configuration is the source of truth for those rules. The reasons are in the ADRs that each rule links.

## All code and documentation

- Write comments and documentation in English. Follow ASD-STE100 (Simplified Technical English).
- Use the terms in [CONTEXT.md](../CONTEXT.md), not synonyms.
- Documentation is the single source of truth. Keep each fact in one file. Link; do not copy.

## Renderer

- Do not write `create…` factories. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Do not use the `private` keyword. Use `#` for private members. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Put one public class in each file. The file name is the class name in kebab-case. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Pass members to the template directly only as arrow-function fields. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Construct a class that uses `$effect` during component initialization. Do not use `$effect.root`. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- State transitions are value objects. Calculations are static-only classes. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Failures are typed exceptions. See [ADR 0007](adr/0007-failures-are-typed-exceptions-caught-in-three-places.md).
- Import another module only through its `index.ts` (the barrel). Do not import its inner files. The barrel is the public surface of the module, so the inner files can move without a change in the callers.
- Inside a module, import the sibling files directly, with a relative path. Never import the module's own barrel. That causes a circular import.
- Import icons one by one. Never import from the icon library barrel. The barrel slows the dev server and the E2E runs.

## Svelte 5 patterns

### State

- Use `$state` only for a value that must update the UI, an effect, or a derived value. Use a plain variable for all other values.
- Use `$state.raw` for a large object or array that you replace but do not mutate.
- Use `$derived` to compute a value from state or from a prop. A prop can change, so a value that depends on it must be derived.
- Use `$props` for component inputs. Do not use `export let`.
- Use `$derived` instead of `$:`.
- Do not mutate a prop.

### Effects

- Do not update state in `$effect`. Use `$derived`, an event handler, or a function binding. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Read every value that an effect must track before its first `await` or `setTimeout`. A value that is read later is not tracked.
- Do not wrap the body of an effect in `if (browser)`. Effects do not run on the server.
- Use `untrack` only when an effect must update state that it also reads, and no other option fits.
- Use `$effect.pre` only when the code must run before the DOM update.

### Template and DOM

- Read a `bind:this` value only in an effect or an event handler. It is `undefined` during component initialization.
- Listen to `window` and `document` events with `<svelte:window>` and `<svelte:document>`. Do not use `onMount` or `$effect` for them.
- Use `onclick={...}` attributes. Do not use the `on:click` directive.
- Use keyed `{#each}` blocks.
- Do not destructure an `{#each}` item if you bind to its fields. Bind to the item object.
- Do not use `{#key}` to rerun the script of a child component. Compute the value with `$derived`. Use `{#key}` only for transitions and animations, because it unmounts its content.
- Sanitize a value before you pass it to `{@html}`. Scoped styles do not apply to `{@html}` content.
- Use `{#snippet}` and `{@render}` instead of `<slot>`.
- Use `{@attach}` instead of `use:`. An attachment reruns when any state that it reads changes. If its setup is expensive, read the state in a child `$effect`.

### Shared state and styling

- Share state between components with a class that has `$state` fields. Do not use a store. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Use context to share state with one part of the app. Do not share state through a module, because it can leak between users during server-side rendering. Use `createContext`, not `setContext` and `getContext`.
- Pass a style value to CSS with the `style:--name={value}` directive. A parent styles a child component with a CSS custom property.
- Use `:global` only when a CSS custom property cannot reach the child component.
- Use clsx-style values in `class`. Do not use the `class:` directive.

## Rust

Clippy enforces the no-panic rule. See [ADR 0010](adr/0010-backend-does-not-panic-errors-are-typed-with-thiserror.md). The rules below are the ones that lint cannot check.

### Failures and invariants

- Use `expect` only for an invariant that the types cannot show, or for a failure at start-up. The message says why the call cannot fail. A message that only names the call is not a reason.
- Do not write `unreachable!`. Remove the impossible branch with the types: split the enum, or carry a validated value.
- Make an invariant a type. Use a newtype with a checked constructor or a `NonZero*` type. Validate once at the boundary. Inside, pass the validated type.
- Write an error as an enum with `#[derive(thiserror::Error)]`. Do not use `anyhow`.
- Map an error cause with `logged`: `.map_err(logged(Code, "area.what"))`. It logs the cause at `warn` and returns the typed code.
- Number conversions go through checked conversions, `From`, or `TryFrom`.
- Index a slice with `.get()`, an iterator, `chunks_exact`, or `split_at_checked`. Use `checked_*` or `saturating_*` for arithmetic that can overflow.
- Add a lint suppression only when the user agrees.
- Every `allow` in `[workspace.lints]` has a comment that gives the reason.

### Generics, memory, and borrows

- Prefer a generic or a trait to `macro_rules!`. Write a macro only when a generic cannot do the job.
- Use static dispatch. Use `dyn` only at a seam, such as an output callback or an event sink.
- Show an allocation in the type. A fixed length is `Box<[T]>`, `Arc<[T]>`, or `[T; N]`. Use `Vec` only for a value that grows. Allocate with `with_capacity`.
- A function that must not allocate takes `&mut [T]` from the caller and writes into it.
- The audio callback does not allocate, lock, panic, or do I/O.
- Write code that is easy for the borrow checker. A struct owns its data or holds an `Arc`; it does not hold a reference with a lifetime. Hold an ID, not a long-lived reference. Pass a value across a thread by `Arc` or by a channel. Keep a borrow short. Do not use `Rc<RefCell<…>>`. Take `&[T]` and `&str` as arguments.

## Dependencies

- The app's dependency versions are locked by `Cargo.lock` and `pnpm-lock.yaml`. Use `=` only for a prerelease.

## Backend tests

- A test of one small function stays in its file, in `#[cfg(test)] mod tests`.
- A test of a module's behavior goes in `<module dir>/tests/<behavior>.rs`. `<module dir>/tests/mod.rs` holds only shared helpers and the `mod` lines.

## E2E tests (`tests-app/`)

- Find regions by `aria-label` or role with CSS. Narrow from page to element: `$(scope).$(…)`.
- Use a text selector only as the final step of a chain. Do not mix strategies in one selector string.
- Add `data-testid` only where no accessible name exists.
- Do not use Tauri or WebdriverIO internals.
