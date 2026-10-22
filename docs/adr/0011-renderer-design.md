# 0011: Renderer design is object-oriented by default, and tests use no test-only seams

Supersedes [ADR 0006](0006-renderer-logic-in-classes-svelte-declarative.md).

The Renderer is object-oriented by default. A state with rules is a class with `$state` fields. A pure calculation is a plain function, not a static-only class.

A class gets its dependencies as constructor arguments. A component gets them with `App.current()`.

`ui/` never imports `app/`. A value such as reduced motion is passed into `ui/` as an argument.

There are no test-only seams. A test replaces a dependency only at a real seam: the generated bindings module (`vi.mock`), and globals such as `requestAnimationFrame` and timers (through stubs and fake timers). Do not add an interface, a parameter, or an export only so that a test can replace it.

Reason: a class keeps its state and its rules in one place. A plain function needs no object to test. A test-only seam is a second path into the code that the app does not run, and it can drift from the real path. A `ui/` module that imports `app/` depends on the whole app, so it cannot be tested or reused alone.

Rejected:

- An interface for every dependency, so that tests can replace it. Each interface has one real implementation, so it adds indirection without a second adapter.
- Static-only classes for calculations. They are plain functions in a class wrapper.
