# 0006: Renderer logic is in classes, and .svelte files are declarative

Stateful Renderer logic is a class. The class has `#` fields and `get` accessors. Factories named `create…` are not used. Pure logic is a value object or a static-only class.

`$effect` is the last resort. Use the first option that fits, in this order: an attachment, then `createSubscriber`, then an event handler, then `$effect`.

A `.svelte` handler is one call to `UserActionRunner.run(...)`. Promise logic is in `.svelte.ts` Controllers. Type-aware lint does not check `.svelte` files, so the logic must be in a `.svelte.ts` file to be checked.

Reason: a class keeps state and its rules in one place. A component only declares the view. The order of `$effect` options keeps side effects out of components when a simpler mechanism exists.
