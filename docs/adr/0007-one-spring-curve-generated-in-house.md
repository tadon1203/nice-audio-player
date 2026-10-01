# 0007: One spring curve, generated in-house

Supersedes [0006](./0006-three-durations-and-one-spring-for-interruptible-motion.md). Research: [spring-motion](../research/spring-motion.md).

Every movement follows one curve: a critically damped spring (Apple's `bounce: 0`) run from rest, which never overshoots. A small pure module computes it from its closed form and emits it twice, as a JS easing (Svelte transitions, `Tween`, the rAF tween, WAAPI keyframes) and as a CSS `linear()` string (CSS transitions, menus), so the two cannot disagree. Tokens are perceptual durations in Apple's sense (`feedback`, `move`, `large`), chosen so the pace stays close to the old 100/300/420ms ease-out; the settling length the animation actually runs is derived from them. Reduced motion stays a 100ms crossfade on the same curve, and progress motion stays linear.

Values retargeted while moving (the Now Playing timeline, lyrics scroll, and anything else found to reverse mid-flight) use an in-house analytic spring on the same formula with an initial velocity, which keeps velocity on retarget. Svelte's `Spring` is not used: its integrator adds acceleration once per frame, so the same parameters are overdamped on 120–240Hz displays (sveltejs/svelte#10717), and its absolute `precision` keeps a 100px move ticking for about a second. Reimplementing it is justified by that, not by taste.

Why not 0006: the ease-out curve and the spring disagreed in feel, and 0006's reasons for backing out of springs (the `motion` dependency, a spring-to-CSS conversion layer, a `visualDuration`/`bounce` vocabulary Svelte does not share) do not apply to this design. There is no dependency, the conversion is one pure function computed once because the curve's shape is fixed, and the only parameter is `duration`. Rejected: Svelte `Spring` for every movement (it cannot drive enter and exit transitions, runs every frame on the main thread, and cannot express CSS hover and press).

## Consequences

- `tokens.ts` stays the only definition; `applyCssMotion` publishes the curve and the settling lengths as CSS variables, and CSS declares no timing. Hand-written `element.animate` calls and the menus' enter/exit take the easing as well as the duration.
- No movement has its own duration or curve. A sweep or a lyric line uses `move`.
- Animations run about 1.18× their perceptual duration before they settle; outros, hand-tuned delays and E2E waits are derived from the tokens, never written as numbers.
- `linear()` needs Chromium 113+; WebView2 Evergreen is assumed.
