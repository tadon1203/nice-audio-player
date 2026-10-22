# Replacing Dependencies

Replace a dependency only at a **real seam**: a boundary that the app itself runs across. A seam is real when the production code uses it the same way the test does.

This project has three real seams:

- **The Renderer's generated bindings module.** Replace it with `vi.mock`. The bindings are the boundary to the Backend.
- **The `OutputStream` trait in the Backend.** Write a test implementation of the trait, and pass it in where the app passes the real output.
- **Globals.** Replace `requestAnimationFrame` and timers with stubs and fake timers.

Everything else runs for real. Do not mock:

- Your own classes or modules.
- Internal collaborators, or anything the same module owns.

## Do not add a seam for a test

Do not add an interface, a parameter, an export, or a constructor argument only so that a test can replace something. A seam that only tests use is a second path through the code, and the app does not run it. See [ADR 0011](../../../docs/adr/0011-renderer-design.md).

If a dependency has one real implementation and no real second one, do not put an interface in front of it. Pass the real object. If the dependency is a third-party service, the test must still use the real code path. Use a real local stand-in if one exists, or accept the gap and say so in the ticket.

## Do not patch internals

A test does not write to a private field or replace a method of a class under test. A class gets its dependencies as constructor arguments, so a test replaces a dependency by passing the same kind of value that the app passes, at one of the seams above.
