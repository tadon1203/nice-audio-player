# 0006: Three durations, one easing, and one spring for interruptible motion

Superseded by [0007](./0007-one-spring-curve-generated-in-house.md). Supersedes [0005](./0005-springs-for-all-motion-with-three-exceptions.md).

Motion is built from what Svelte and CSS already provide, with no animation library. There are three durations, each with the same ease-out curve: `feedback` (100ms: hover, press, colour changes), `move` (300ms: icons, digits, lyric lines, the queue, overlays) and `large` (420ms: Dock <-> Now Playing, album tile <-> details, the Sleeve, the Light). Reduced motion replaces every movement with a 100ms crossfade, and progress motion (the playing position, scan progress) runs at constant speed, as before.

The one other kind is `settle`: a fully damped `Spring` from `svelte/motion` (no overshoot; Apple's `.smooth` at a 0.4s perceptual duration, stiffness 0.0685 and damping 0.5236 in Svelte's units). It is for values whose target keeps changing mid-flight and which carry position: the Now Playing open/close timeline and lyrics scroll. A spring keeps its velocity when retargeted; a tween restarts from rest, which shows as a hitch only in large movements.

0005 made every movement a spring so that nothing jumps when interrupted. A retargeted tween does not jump in position (it restarts from where it is), only in velocity, and that is visible in only a few places. Paying for it everywhere meant a spring-to-CSS conversion layer, the `motion` dependency and a vocabulary of `visualDuration`/`bounce` that Svelte does not share. Rejected: keeping `press` as an overshooting spring (a second kind of curve for one button), and springs for the queue panel and the Sleeve hand-off (they are Svelte transitions, which cannot carry velocity; revisit if reversing them mid-flight proves ugly).

## Consequences

- `tokens.ts` is the only definition. CSS reads `--default-transition-*`, `--motion-overlay-*` and `--motion-medium-*`, which `applyCssMotion` sets from it; CSS declares no timing.
- `motion` is removed. Imperative animations use a small rAF tween (`tween-number.ts`) or the Web Animations API.
- Springs are not a rule of the design any more: a new movement picks a duration, and uses `settle` only if it can be retargeted while moving.
