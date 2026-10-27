# Coding standards

General best practices for Rust, TypeScript, and Svelte 5 take precedence over this document. If a rule here conflicts with standard community practices, change the rule.

Do not document rules that linters or formatters already enforce. Tool configuration is the single source of truth for formatting and linting.

## Documentation and general rules

- Write comments and documentation in clear, simple English (ASD-STE100 can be used as a general guide).
- Documentation is a single source of truth. Keep each fact in one place; link to it rather than duplicating it.
- Keep dependency versions locked via the package manager lockfiles.

## Design principles

- Keep it simple and plain. Avoid speculative enterprise abstractions, unnecessary forwarding layers, and single-implementation traits or interfaces. Introduce seams only where behavior actually varies or at I/O boundaries.
- Use a single source of truth. Each piece of state has one clear owner. Derived values should be calculated on demand rather than stored and synchronized manually.
- Fail cleanly. Validate data at boundaries (I/O, IPC, user input). Trust validated internal data. Do not write defensive fallbacks or silent error swallowing that masks bugs.
- Keep commands and queries separate. A command mutates state and acknowledges completion or failure; it does not return the updated global state. Queries read data without modifying state.

## Naming

Keep naming **boring, plain, and conventional**. Do not use ornate or enterprise-style patterns.

- Conventions by language:
- Rust: Follow standard [Rust API Guidelines (Naming)](https://rust-lang.github.io/api-guidelines/naming.html).
- TypeScript: Standard `UpperCamelCase` for types/classes/interfaces, `lowerCamelCase` for variables and functions, and `SCREAMING_SNAKE_CASE` for constants.

- Boring and direct:
- Name things for what they are, not how clever they sound. Use concrete nouns for types/values and active verbs for functions.
- Avoid clever metaphors or project-specific jargon where standard, boring terms exist.
- Abbreviate only universally recognized terms. Spell out everything else.

## Errors and panics

- Use `Result` for recoverable conditions: failures that can normally happen in an environment (file missing, network/device drop, invalid input).
- Unmet internal invariants and impossible conditions should panic or abort. Avoid defensive checks that create dead code.
- Validate at system boundaries. Pass strongly typed, validated values inward.
- Preserve error causes using standard error wrapping (`?`, `source`, or error context libraries) rather than discarding error context.

## Rust

- Standard idioms take precedence. Favor plain functions and standard structs over complex generic hierarchies.
- Use `anyhow::Result` for application-level handling where errors are simply propagated, and explicit `thiserror` enums for domain boundaries where callers must pattern-match specific variants.
- Real-time or audio threads must not allocate, block, lock, or perform I/O.
- Handle every `Result`. Log or explicitly pass errors up; do not discard errors with `let _ = ...` unless dropping the result is deliberate (e.g., sending to an optional or closed channel).

## TypeScript

Source: [TypeScript Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html).

### Types

- Do not use `Number`, `String`, `Boolean`, `Symbol`, or `Object` as types. Use `number`, `string`, `boolean`, `symbol`, or `object`.
- Do not use `any`, except when you migrate a JavaScript file. Use `unknown` when you do not know the type.
- Do not write a generic type that does not use its type parameter.

### Callbacks

- Use `void` as the return type of a callback whose return value you ignore. `any` lets the caller use the value without a check.
- Do not mark a callback parameter as optional unless you mean it. A callback can ignore a trailing parameter, so write the parameter as required.

### Overloads

- Do not write overloads that differ only in callback arity. Write one overload with the maximum arity.
- Put more specific overloads before more general overloads. TypeScript uses the first overload that matches.
- Use optional parameters instead of overloads that differ only in trailing parameters, when all overloads return the same type.
- Use a union type instead of overloads that differ only in the type of one argument, when all overloads return the same type.

### Narrowing

- Narrow a union with `typeof`, `in`, `instanceof`, or a literal property (discriminated union) before you read a member-specific property.
- Check `null` on its own. `typeof null` is `"object"`. A truthiness check also removes `0` and `""`. Use `x != null` to remove both `null` and `undefined`.
- Handle every case of a union in a `switch`. In `default`, assign the value to a `never` variable. A new union member then causes a compile error.

### Compiler options

- Keep `strict: true` in `tsconfig.json`.
- Set an individual strict flag to `false` only with a stated reason. An individual flag overrides the `strict` family.

Sources: [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [TSConfig `strict`](https://www.typescriptlang.org/tsconfig/strict.html).

### Inference and assertions

- Do not add a type annotation when TypeScript infers the same type.
- Do not use `as T` to hide a real type mismatch. An assertion is not checked at runtime. Use `as const` for literal values.
- Validate untrusted input at runtime. Types are erased at compile time.

### Objects and interfaces

- Use `interface` for object shapes. Use `type` for unions and aliases.
- Use `readonly` to show intent. It does not make nested values immutable. Use `readonly T[]` for arrays that you do not change.
- Use `interface ... extends` to add members to a type. Check an intersection (`A & B`) for properties that became `never`.
- Do not bypass excess property checks by reflex. A misspelled key is usually a bug. Add an index signature only when extra keys are intended.
- Use generics instead of `any`, `unknown`, or several near-identical types.

### Functions and generics

- Use the type parameter in the signature. Do not add a constraint that hides its type, such as `extends any[]`.
- Remove a type parameter that appears only once in a signature.

### Classes

- Assign each field in the constructor body. Use `name!: string` only when another mechanism sets the field.
- Use `readonly` for a field that you set once.
- Use `#field` when you need runtime privacy. `private` is checked at compile time only.
- Use `declare` to change the type of an inherited field without emitting code.
- `implements` only checks compatibility. It does not add members.

### Modules and derived types

- Use `import type` for imports that are used only as types.
- Derive a type from a value or another type with `typeof`, `keyof`, and indexed access types. Do not write the same shape twice.

Sources: [Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html), [Basic Types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html), [Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html), [Objects](https://www.typescriptlang.org/docs/handbook/2/objects.html), [Classes](https://www.typescriptlang.org/docs/handbook/2/classes.html), [Modules](https://www.typescriptlang.org/docs/handbook/2/modules.html), [Creating Types from Types](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html).

## Frontend (TypeScript & Svelte 5)

- Favor plain objects and standard functions. Use classes primarily when encapsulating reactive state and behavior together.
- Keep presentational components decoupled from global store and application logic by passing data via props.

### TypeScript conventions

Follow the official TypeScript guidelines and Do's and Don'ts:

- Use lowercase primitive types: number, string, boolean, symbol, and object. Do not use boxed object wrappers such as Number or String.
- Use unknown for unchecked or external data, then narrow the type with type guards. Do not use any.
- Use void for callback return values that callers ignore. Do not mark callback parameters as optional unless callers must explicitly pass undefined.
- Use union types or optional parameters instead of overload signatures when you can. When you must use overloads, put specific signatures before general signatures.
- Prefer interface extension (interface A extends B) over type intersections (&) when you compose object shapes.
- Avoid as casts. Use type annotations and type predicates (x is T) instead.

### Svelte 5 conventions

- Follow official Svelte 5 runes guidance:
- Use `$state` for mutable values that affect the UI.
- Compute derived state using `$derived`. Do not synchronize state inside `$effect`.
- Use `$effect` only for side effects (DOM interaction, external subscriptions, analytics).
- Use `<svelte:window>` / `<svelte:document>` for window-level event listeners.
- Use standard runes mode for all new code (`$props`, `$derived`, `$effect`, snippets).

#### Reactivity & State

Do not destructure a `$state` array or object if its elements must stay reactive. Destructuring breaks reactivity unless you declare the result in `$derived` or `$props`.

Use `$state.raw` for large objects or collections that you only reassign, such as API payloads or read-only cache items. Recursive proxies use memory and CPU time.

Pass a getter (`() => state`) or an object with getters to external functions and constructors. A state variable gives its value when you read it.

Do not export a reassigned `$state` variable from a `.svelte.ts` module. Wrap the state in an exported object or class instance, or expose read and write functions.

Call `$state.snapshot(val)` before you pass reactive state to an API that expects plain objects. Examples are `structuredClone`, Web Workers, and Tauri IPC payloads.

#### Props & Bindings

Do not change a prop in a child component. For two-way binding, declare the prop with `$bindable()`. Otherwise, use callback props (`on<event>`).

Type snippet props with `Snippet<[T1, T2, ...]>` from `svelte`. Render a snippet only with `{@render ...}` or `{@render snippet?.()}`. Do not call a snippet as a function.

Use function bindings (`bind:value={() => readVal, (newVal) => writeVal}`) for linked state. Do not use two-way `$effect` loops to sync dependent inputs.

#### Effects & Lifecycle

`$effect` and `$derived` track only the reads that run synchronously. A read in `setTimeout`, in a promise, or after `await` is not tracked.

Use `untrack(() => state)` to read a value in an effect without tracking it.

Put `$inspect.trace(label)` on the first line of an effect or `$derived.by`. Use it to find which dependency caused an update.

#### DOM, Events & Styling

Svelte 5 delegates common DOM events, such as `click`, `keydown`, and `pointerdown`, to the root. For a custom event that a delegated listener must receive, set `{ bubbles: true }`. To add a listener in code, use `on` from `svelte/events`.

Use `{@attach fn}`, not the deprecated `use:action`. An attachment runs in an effect scope. It is removed on unmount or when its arguments change. Wrapper components can compose attachments.

Pass arrays or objects to the `class` attribute (handled by `clsx`), or use the `ClassValue` type from `svelte/elements`. Do not use `class:` directives or manual string concatenation.

## Testing

- Test through public interfaces rather than inspecting internal or private details.
- Mock or replace dependencies only at real boundaries (e.g., OS/hardware interfaces, timers, external I/O). Do not mock internal helpers.
- Keep unit tests close to the tested code, and integration/E2E tests focused on user-visible behavior.
