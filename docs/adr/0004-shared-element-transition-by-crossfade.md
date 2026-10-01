# 0004: Shared-element transitions use an extended crossfade, not View Transitions

The Sleeve moving between the dock and Now Playing, and an album tile moving into its detail header, are built on Svelte's `crossfade` (send/receive), extended to interpolate position and size with `transform` and to handle the corner radius by clipping. The View Transitions API is the last resort, used only if this cannot be built.

View Transitions would be smaller to implement, but it ignores input during the transition and cannot be interrupted. That breaks DESIGN.md principle 1 (motion never delays an action) and principle 7 (motion is interruptible and loses no information under reduced motion). The crossfade approach is interruptible and can compute positions inside scrolling regions.

Details: [svelte-migration-plan.md](../svelte-migration-plan.md) §6.5.

## As built

Svelte's `crossfade` needs both ends alive at once, which a route change does not give (the old page is gone before the new one mounts). So `lib/ui/motion/shared-element.ts` keeps the idea (send/receive, interruptible, no View Transitions) with a small registry instead: the end that goes away records its box, the end that appears flies a clone in from there with `transform` keyframes sampled from the `large` easing, and the clone's radius is set in its own units so scaling does not stretch the corners. Reversing mid-flight departs from the clone's current box. Under reduced motion the Sleeve only crossfades.
