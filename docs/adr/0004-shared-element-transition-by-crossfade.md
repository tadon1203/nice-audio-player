# 0004: Shared-element transitions use an extended crossfade, not View Transitions

The Sleeve moving between the dock and Now Playing, and an album tile moving into its detail header, are built on Svelte's `crossfade` (send/receive), extended to interpolate position and size with `transform` and to handle the corner radius by clipping. The View Transitions API is the last resort, used only if this cannot be built.

View Transitions would be smaller to implement, but it ignores input during the transition and cannot be interrupted. That breaks DESIGN.md principle 1 (motion never delays an action) and principle 7 (motion is interruptible and loses no information under reduced motion). The crossfade approach is interruptible and can compute positions inside scrolling regions.

Details: [svelte-migration-plan.md](../svelte-migration-plan.md) §6.5.
