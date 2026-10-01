# Research: making (almost) all motion a no-overshoot spring

Question: "I want to make as much motion as possible a spring (basically no overshoot). What's the appropriate way?"

Context: [ADR 0005](../adr/0005-springs-for-all-motion-with-three-exceptions.md) went all-spring with the `motion` package; [ADR 0006](../adr/0006-three-durations-and-one-spring-for-interruptible-motion.md) backed out because of a spring-to-CSS conversion layer, the `motion` dependency, and a `visualDuration`/`bounce` vocabulary Svelte does not share. Today: three durations (`feedback` 100ms, `move` 300ms, `large` 420ms) with one ease-out (`cubicOut` / `cubic-bezier(0.33, 1, 0.68, 1)`), plus `settle`, a Svelte `Spring` for the Now Playing timeline and lyrics scroll (`src/lib/ui/motion/tokens.ts`).

Numbers marked _(computed)_ come from a throwaway Node script evaluating the formulas below and simulating Svelte's integrator line for line; they are not from a source.

## TL;DR

- A critically damped spring (bounce 0) from rest has a closed form, so **no library is needed**: one ~25-line pure function can turn a _perceptual duration_ into (a) a JS easing `(t) => number` for Svelte transitions, `Tween`, `tweenNumber` and WAAPI, and (b) a CSS `linear()` string for CSS transitions. Both come from one formula, so they cannot disagree.
- Fixed-duration spring easings get the spring's **shape** (soft start, long smooth tail). They **do not carry velocity** when interrupted. Only a real spring simulation (Svelte `Spring`, or a small analytic spring) does that. Keep that for the few values that are retargeted while moving (as ADR 0006 already does).
- Svelte's `Spring` is **refresh-rate dependent**. At 60Hz `settle` is roughly Apple's 0.4s `.smooth`. At 144Hz it becomes overdamped (ζ ≈ 1.55) and its tail is slower (open Svelte issue [#10717](https://github.com/sveltejs/svelte/issues/10717)). A ~40-line analytic spring fixes this and uses the same perceptual-duration vocabulary.
- Recommended: supersede ADR 0006 with one curve (a critically damped spring) and three perceptual durations. Keep reduced motion as a crossfade and progress motion linear. This avoids all three costs ADR 0006 rejected: no dependency, one tiny pure generator instead of a conversion layer, and the only vocabulary is "duration" (bounce is always 0, so it is not a parameter).

## 1. Mechanisms available without an animation library

### (a) Spring sampled into CSS `linear()`

- `linear()` takes a list of output progress values with optional input percentages. Points without percentages are spaced evenly, and output values outside [0, 1] are allowed. Sources: [CSS Easing Level 2, `linear()`](https://drafts.csswg.org/css-easing-2/#the-linear-easing-function) and [MDN `linear()`](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear).
- Shipped in Chrome 113. Chrome's post recommends approximating curves with enough stops and points to the Linear Easing Generator by Jake Archibald and Adam Argyle: [developer.chrome.com, "Create complex animation curves in CSS with the linear() easing function"](https://developer.chrome.com/docs/css-ui/css-linear-easing-function) and [linear-easing-generator.netlify.app](https://linear-easing-generator.netlify.app/). MDN lists it as Baseline, widely available since December 2023 ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear)).
- What it can do: any CSS `transition`/`animation` and any WAAPI `easing` can use it. That includes hover/press/colour changes that are CSS-only today (`--default-transition-timing-function`, `--motion-*-easing`, read by Tailwind's `transition` utilities and `app.css`).
- What it cannot do: it is a fixed curve over a fixed duration, so it has no velocity input. When a CSS transition is interrupted, the new transition starts from the property's current value. If it reverses, the duration is shortened by the "reversing shortening factor" ([CSS Transitions 1, §3](https://drafts.csswg.org/css-transitions-1/#transition-reversing-shortening-factor)). Position stays continuous, but velocity restarts at zero.

### (b) Spring easing function `(t) => number` as a Svelte `easing`

- Svelte docs: "If the returned object has a `css` function, Svelte will generate keyframes for a web animation" ([svelte.dev/docs/svelte/transition](https://svelte.dev/docs/svelte/transition)).
- Source confirms it (`svelte@5.57.1`, [`src/internal/client/dom/elements/transitions.js`](https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/internal/client/dom/elements/transitions.js), function `animate`):
  - `n = Math.ceil(duration / (1000 / 60))` keyframes, each `css(t, 1 - t)` with `t = t1 + delta * easing(i / n)`.
  - Then `element.animate(keyframes, { duration, fill: 'forwards' })` with no `easing` option, so WAAPI interpolates **linearly** between keyframes at 60 samples per second.
  - So a JS easing is already turned into a piecewise-linear curve. A spring easing goes through exactly the same path as `cubicOut` today, with no extra cost or loss.
  - On reversal (bidirectional `transition:`, or an intro that interrupts an outro), `t1 = counterpart.t()` and `duration *= |delta|`. The new animation re-runs the easing from its start, so position is continuous and velocity resets.
- `crossfade` accepts `easing` and a `duration` number or function (`(d) => Math.sqrt(d) * 30` by default). `flip` accepts `easing` and `duration` (default `(d) => Math.sqrt(d) * 120`). `animate:` re-measures with `getBoundingClientRect()` on retrigger, so it starts from the visual position. Sources: `node_modules/svelte/src/transition/index.js`, `src/animate/index.js`, and the `animation()` function in `transitions.js` ([GitHub](https://github.com/sveltejs/svelte/tree/main/packages/svelte/src)). A custom spring easing therefore drops into every directive used here (`slideTransition`, `contentFade`, `crossfade` in `navigation.svelte`, `animate:flip` in `upcoming-list.svelte`).
- `Tween` takes `easing` and `duration` (number or `(from, to) => number`) ([svelte.dev/docs/svelte/svelte-motion](https://svelte.dev/docs/svelte/svelte-motion)). On retarget it starts a new eased run from the current value, so velocity resets (`src/motion/tweened.js`).
- `shared-element.ts` already samples `easing` into 24 WAAPI keyframes (`flightKeyframes`), and `tweenNumber` takes `easing`. Both take a spring easing as-is.

### (c) `svelte/motion` `Spring` (retargetable)

- Source: [`packages/svelte/src/motion/spring.js`](https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/motion/spring.js). Each rAF tick:
  - `dt = elapsed_ms * 60 / 1000`, in "60 Hz frames", with `elapsed` clamped to 1/30 s.
  - `velocity = (current - last) / dt`, `acceleration = (stiffness * delta - damping * velocity) * inv_mass`, `d = (velocity + acceleration) * dt`.
  - It settles when both `|d|` and `|delta|` are below `precision`, default 0.01 and in **value units**, not relative.
  - `stiffness` and `damping` are clamped to [0, 1]. `set(v, { preserveMomentum: ms })` and `{ instant: true }` exist.
- It carries velocity on retarget, because velocity is derived from the last two positions. It is the only no-library mechanism that does.
- Limits:
  - It runs on the main thread and writes reactive state every frame.
  - It is not CSS, so hover and press cannot use it.
  - It has no duration, so "when does it finish" depends on distance and `precision`.
  - It is refresh-rate dependent (below).

### Reduced motion

None of the mechanisms handles reduced motion by itself. The existing seam (`resolveDuration` → crossfade, `prefersReducedMotion`, `applyCssMotion(root, reduced)`, `budget.current === "reduced"` → `spring.set(x, { instant: true })`) stays as it is.

## 2. The math

### Duration and bounce → physics (Apple)

- Apple's `Spring(duration:bounce:)` docs: `duration` "defines the pace of the spring. This is approximately equal to the settling duration, but for springs with very large bounce values, will be the duration of the period of oscillation". `bounce` 0 is "a critically damped spring" ([developer.apple.com, Spring.init(duration:bounce:)](<https://developer.apple.com/documentation/swiftui/spring/init(duration:bounce:)>)).
- `.smooth` is "a smooth spring … with no bounce" ([Animation.smooth](https://developer.apple.com/documentation/swiftui/animation/smooth)). `.snappy` has "a small amount of bounce" ([Animation.snappy](https://developer.apple.com/documentation/swiftui/animation/snappy)). `smooth(duration:extraBounce:)` defaults to duration 0.5 ([docs](<https://developer.apple.com/documentation/swiftui/animation/smooth(duration:extrabounce:)>)).
- WWDC23 "Animate with springs" gives the conversion: `mass = 1`, `stiffness = (2π / duration)²`, `damping = (1 − bounce) · 4π / duration` for bounce ≥ 0. The talk also says a spring from rest "need[s] to preserve a velocity of 0 at the beginning" and that the perceptual duration is chosen to be predictable, unlike the settling duration ([WWDC23 session 10158, transcript and code at 19:26](https://developer.apple.com/videos/play/wwdc2023/10158/)).
- With bounce 0, damping = 2√stiffness, so ζ = 1 and ω = 2π / duration.
- For reference only: Motion's `visualDuration` uses `ω = 2π / (visualDuration · 1.2)`. So Motion's "0.4" is Apple's 0.48 ([motion-dom `spring.ts`](https://github.com/motiondivision/motion/blob/main/packages/motion-dom/src/animation/generators/spring.ts)). This is one reason the ADR 0005 numbers do not transfer one-to-one.

### Critically damped closed form

From rest, normalised 0 → 1:

```
x(t) = 1 − (1 + ωt)·e^(−ωt)      x'(0) = 0,  x''(0) = ω²
```

With an initial offset from target `x₀` and velocity `v₀`, measuring `x` as the offset from target (needed for retargeting):

```
x(t) = (x₀ + (v₀ + ω·x₀)·t)·e^(−ωt)
v(t) = (v₀ − ω·(v₀ + ω·x₀)·t)·e^(−ωt)
```

### Settle threshold → total (CSS/WAAPI) duration

Solve `(1 + u)e^(−u) = ε` with `u = ωT`, so `T = u / ω = d · u / 2π` _(computed)_:

| residual ε | u    | T / perceptual d | d = 100ms | d = 300ms | d = 420ms |
| ---------- | ---- | ---------------- | --------- | --------- | --------- |
| 1%         | 6.64 | 1.06             | 106ms     | 317ms     | 444ms     |
| 0.5%       | 7.43 | 1.18             | 118ms     | 355ms     | 497ms     |
| 0.1%       | 9.23 | 1.47             | 147ms     | 441ms     | 617ms     |

Apple's "duration ≈ settling duration" corresponds to about a 1% residual.

Recommendation: cut at ε = 0.5% and **renormalise** (divide by `x(T)`), so the curve ends exactly at 1 with no last-frame jump. The leftover end velocity is 0.033 of the average speed _(computed)_. On a 400px move over ~470ms that is about 30px/s, which is not visible.

### How many `linear()` points

Maximum error of the renormalised ε = 0.5% curve, evenly spaced points, no percentages _(computed)_:

| points | max error | on a 400px move | string length |
| ------ | --------- | --------------- | ------------- |
| 25     | 0.88%     | 3.5px           | ~200 chars    |
| 33     | 0.53%     | 2.1px           | ~250 chars    |
| 41     | 0.36%     | 1.4px           | ~320 chars    |

Adaptive spacing with percentages reaches 0.2% error with 17 points (~230 chars) _(computed)_. Most of the error is in the first ~10%, where curvature is highest. For opacity and colour, 25 even points are more than enough. **41 even points** is the simple choice for everything: no percentages, and the length does not matter for a custom property set once.

For comparison, Svelte's own keyframe sampling is one point per 16.7ms, so 26 points for 420ms. That is what `cubicOut` gets today.

### Mapping to Svelte `Spring` units, and checking ADR 0006's numbers

- At exactly 60Hz (`dt = 1`), the per-tick update is `v ← v + k·δ − c·v`, `x ← x + v`. That is a continuous spring with `k = ω_f²` and `c = 2ζ·ω_f`, where `ω_f = ω / 60` is in radians per frame.
- For d = 0.4s: `ω_f = 2π / 0.4 / 60 = 0.2618`, so `k = 0.06854` and `c = 0.5236`. **ADR 0006's 0.0685 / 0.5236 is the correct continuous mapping.**
- The discrete integrator is less accurate than that. At 60Hz the simulated `settle` reaches 99% at **483ms**, while the continuous 0.4s spring does so at 423ms. 50% comes at 100ms vs 107ms _(computed)_. That is close enough to call it ".smooth 0.4s".
- **Refresh-rate dependence (correction to the ADR):**
  - `acceleration` is added to velocity once per tick, not scaled by `dt`. At refresh rate `f` the effective spring is `k' = k / h` and `c' = c / h`, with `h = 60 / f`, so ζ' = ζ / √h.
  - Simulated: 120Hz gives ζ ≈ 1.41 and t99 ≈ 542ms. 144Hz gives ζ ≈ 1.55 and t99 ≈ 549ms. 240Hz gives ζ = 2.0 and t99 ≈ 567ms. There is never overshoot.
  - The start (t50 ≈ 90ms) stays similar, but the tail gets longer and flatter on high-refresh displays.
  - Upstream: [sveltejs/svelte#10717](https://github.com/sveltejs/svelte/issues/10717) ("`spring` performs differently on displays with different refresh rates"), open, milestone 5.x.
- `precision` is absolute. A 100px move with `precision: 0.01` (the default, which `settle` uses) keeps ticking until about **950ms** at 60Hz and about 1090ms at 144Hz _(computed)_, because it waits for a 0.01px residual.
- `now-playing-motion.ts`'s exit scaling (stiffness / s², damping / s) is correct in continuous terms. It keeps ζ = 1 at 60Hz.

## 3. Is a fixed-duration critically damped spring visibly different from today's ease-out?

- **Initial velocity is zero, not non-zero.** A spring from rest starts at velocity 0 (x'(0) = 0, per Apple above), while `cubicOut` starts at 3× the average speed. The spring's acceleration is large (ω²), so by 5% of the run its slope is already ~1.9 _(computed)_. The "win" is not a faster start. It is a soft start plus a long, smooth exponential tail.
- Same total length, spring (ε = 0.5%) vs `cubicOut`: maximum difference 10% of the distance, near the start. 50% is reached at 22.5% vs 20.6% of the run _(computed)_.
- Best time-fit: the critically damped spring closest to `cubicOut` 100/300/420ms has a perceptual duration of about **74/220/308ms** (settling at ε = 0.5% in 88/260/364ms). The maximum difference is then 7.5% of the distance _(computed)_.
  - On a 100ms colour change: indistinguishable.
  - On a 400px, 420ms move: a ~30px difference at some instant, seen as "more physical", with a slightly later start and a gentler landing.
  - So the change is subtle but real for `move`/`large`, and cosmetic for `feedback`.
- **Interruptions:**
  - Only a true spring (c) matches velocity.
  - A restarted spring easing (a/b) drops velocity to 0 and accelerates again. A restarted `cubicOut` jumps straight to 3× average speed in the new direction.
  - So the spring curve gives a softer reversal even without velocity carry. It still shows a velocity discontinuity (WWDC23: "If an object's velocity suddenly changes, that also feels unnatural").

## 4. Recommended design for this codebase

### Tokens

Durations are perceptual. Bounce is fixed at 0, so it is not a parameter.

```ts
// tokens.ts — perceptual durations (Apple's meaning); the curve is always a critically damped spring.
export const motionTokens = {
  feedback: { duration: 75 },  // was 100ms ease-out; settles ≈ 89ms
  move: { duration: 220 },     // was 300ms; settles ≈ 260ms
  large: { duration: 310 },    // was 420ms; settles ≈ 366ms
} as const;
export const crossfade = { duration: 100 } as const; // reduced motion: fixed length, same curve
```

(Pick values by eye. The ones above keep today's pace. Using today's numbers as perceptual durations would make everything about 18% longer and slower in the middle.)

### One generator, two outputs

```ts
// spring-curve.ts (sketch, not applied)
const REST = 0.005;            // residual at which the curve is cut off
const U = 7.43;                // ωT where (1 + ωT)e^(−ωT) = REST
const END = 1 - (1 + U) * Math.exp(-U);
const POINTS = 40;

/** A critically damped spring from rest, run to rest in its settling time (Apple's model, bounce 0). */
export function springCurve(perceptualMs: number) {
  const duration = Math.round((perceptualMs * U) / (2 * Math.PI)); // settling time
  const easing = (t: number) => (t >= 1 ? 1 : (1 - (1 + U * t) * Math.exp(-U * t)) / END);
  const css = `linear(${Array.from({ length: POINTS + 1 }, (_, i) => +easing(i / POINTS).toFixed(4)).join(", ")})`;
  return { duration, easing, css };
}
```

Note that the easing shape does not depend on the duration: with a fixed ε it is one curve. So `EASE_OUT_CSS` / `cubicOut` become one `SPRING_EASING` / `SPRING_CSS` pair, and only the durations change per token. Then:

- `svelte-motion.ts`: `motionFor(token, reduced)` returns `{ duration: settle(token), easing: springEasing }`. Every call site that takes `duration`/`easing` is unchanged. That covers `slideTransition`, `contentFade`, `crossfade`, `flip`, `Tween`, `tweenNumber`, `flightKeyframes` and the `element.animate` call sites.
- `css-motion.ts`: `applyCssMotion` sets the same variables with `duration = settling ms` and `easing = SPRING_CSS`. CSS keeps declaring no timing.
- Hand-written WAAPI calls that pass only `duration` (`kinetic-text`, `dock-volume`, `virtual-media-grid`) should pass the curve's `css` as their `easing`, or they stay linear.
- The `tw-animate-css` enter/exit on menus (`animate-in`/`zoom-in-95`) only reads the duration variable. Its timing function is the library's, so it needs the easing variable too.

### Interruptible values stay true springs

Which values: the Now Playing timeline (`now-playing-tween.svelte.ts`), lyrics scroll (`lyrics-follow.svelte.ts`), and anything newly found to reverse mid-flight (ADR 0006 named the queue panel and the Sleeve hand-off as candidates).

**Option A (minimal):** keep Svelte `Spring` and derive its parameters from the same token:

`stiffness = (2π / d_s / 60)²`, `damping = 2·√stiffness`

Accept the refresh-rate drift, and set `precision` relative to the distance (for example 0.5px rather than 0.01px) so it stops when it looks stopped.

**Option B (recommended):** a ~40-line analytic critically damped spring using the closed form in §2. It retargets by reading `x(t)` and `v(t)` at "now" and restarting with them as `x₀` and `v₀`. It is exact and frame-rate independent, uses the same perceptual-duration token, and has no integrator.

```ts
// spring-value.ts (sketch). Retargetable, velocity-preserving, frame-rate independent.
export function springValue(initial: number, perceptualMs: number, onUpdate: (v: number) => void) {
  const w = (2 * Math.PI) / perceptualMs;  // per ms
  let target = initial, x0 = 0, v0 = 0, t0 = 0, frame = 0;
  const at = (now: number) => {
    const t = now - t0, e = Math.exp(-w * t), b = v0 + w * x0;
    return { x: (x0 + b * t) * e, v: (v0 - w * b * t) * e }; // offset from target, px/ms
  };
  const step = (now: number) => {
    const { x, v } = at(now);
    if (Math.abs(x) < 0.25 && Math.abs(v) * 16 < 0.25) { onUpdate(target); frame = 0; return; }
    onUpdate(target + x);
    frame = requestAnimationFrame(step);
  };
  return {
    set(next: number) {
      const now = performance.now();
      const { x, v } = frame ? at(now) : { x: 0, v: 0 };
      const current = target + x;
      target = next; x0 = current - next; v0 = v; t0 = now;
      if (!frame) frame = requestAnimationFrame(step);
    },
    jump(next: number) { cancelAnimationFrame(frame); frame = 0; target = next; onUpdate(next); },
  };
}
```

A `.svelte.ts` wrapper can expose `current` as `$state` (to be written through `svelte-file-editor`). With this in place, Svelte's `Spring` and its unit conversion leave the codebase, and "stiffness/damping" disappears from the vocabulary.

### Reduced motion and progress motion

- **Reduced motion:** unchanged. Every movement becomes the 100ms crossfade. It can use the same spring curve with a fixed 100ms length, so it keeps one curve but its own duration, like ADR 0005's `crossfade`. Retargetable springs `jump`.
- **Progress motion:** unchanged (linear, proportional to time or work). It is not a spring and not a token.

### What the ADR needs

Write **ADR 0007, superseding 0006**. Amending is not enough, because the curve changes for every movement and the token meaning changes from total length to perceptual duration. Content:

- One curve: a critically damped spring (Apple's bounce 0), generated in-house from its closed form.
- Three perceptual durations, plus the crossfade.
- Interruptible values use the analytic spring (or `Spring`) with the same durations.
- Reduced motion and progress motion are as before.

Of 0006's rejected costs:

| ADR 0006 cost                        | Status under this design                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `motion` dependency                  | Avoided. A closed form with no library.                                                                                                                                               |
| Spring-to-CSS conversion layer       | Shrinks to one pure function. It is computed once, not per token, because the shape is fixed. Today's `tokens.test` / `css-motion.test` style tests can assert that JS and CSS agree. |
| `visualDuration`/`bounce` vocabulary | Avoided. The only parameter is `duration` (Svelte's word). Bounce is a design rule, not a parameter. With option B, `stiffness`/`damping` go too.                                     |

Also update DESIGN.md principle 7 ("three durations … with one ease-out curve" becomes "… one spring curve, no overshoot") and the tokens doc comment.

## 5. Risks and limits

- **WebView2 support:** `linear()` needs Chromium 113+ ([Chrome post](https://developer.chrome.com/docs/css-ui/css-linear-easing-function)). Tauri's default `webviewInstallMode` is `downloadBootstrapper`, which installs the Evergreen runtime ([v2.tauri.app/distribute/windows-installer](https://v2.tauri.app/distribute/windows-installer/)). Evergreen "updates automatically" and ships with Windows 11 ([Microsoft Learn, WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)). So only machines whose admin has frozen WebView2 updates could be older. An invalid `linear()` value falls back to the property's initial `ease`, which degrades gracefully. A JS easing has no such risk.
- **Svelte transitions:** a custom `easing` is fully supported by `in:`/`out:`/`transition:`, `crossfade` and `flip` (§1b). The keyframes are precomputed at 60 per second, so a spring curve costs the same as `cubicOut`.
- **Total length exceeds the perceptual length** (×1.18 at ε = 0.5%):
  - Outros remove the element only after the full settling `duration`, which delays DOM removal and `onoutroend`.
  - `content-fade.ts`'s `CONTENT_DELAY_MS` and other hand-tuned delays are tied to today's lengths.
  - E2E: `playwright.config.ts` runs everything with reduced motion except `tests/motion.e2e.ts`, which samples for 900ms. The current `settle` already needs ~950ms for a 100px move at 60Hz _(computed)_, so that window is already marginal. `now-playing-layout.e2e.ts` waits 650ms.
  - Keep `large`'s settling length under ~400ms, or base waits on `getAnimations()` / `finished` rather than fixed sleeps.
- **Interruption is still a velocity reset** for everything except the true springs (§3). If a CSS-only state reverses often (hover in and out), the spring curve feels softer than `cubicOut` but is not velocity-matched.
- **Performance:**
  - Transform and opacity animations with a `linear()` timing function, or with many WAAPI keyframes (what Svelte already emits), stay off the main thread when composited ([Svelte docs: "web animations can run off the main thread"](https://svelte.dev/docs/svelte/transition)).
  - JS springs (`Spring`, the analytic spring, `Tween`) run on rAF on the main thread. That is fine for one or two values, as ADR 0006 limits them.
  - Not verified here: whether Chromium composites `linear()` easings on every property path. Check with DevTools "Animations"/Performance once.
- **Refresh rate:** a fixed-duration curve looks the same at any Hz. Svelte `Spring` does not (§2). This is the main reason to prefer option B for the retargetable values.

## Sources

- CSS Easing Level 2, `linear()`: https://drafts.csswg.org/css-easing-2/#the-linear-easing-function
- MDN `linear()`: https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear
- Chrome for Developers, linear() easing: https://developer.chrome.com/docs/css-ui/css-linear-easing-function
- Linear Easing Generator (Jake Archibald / Adam Argyle): https://linear-easing-generator.netlify.app/
- CSS Transitions 1 (interruption, reversing): https://drafts.csswg.org/css-transitions-1/#transition-reversing-shortening-factor
- Svelte transitions docs: https://svelte.dev/docs/svelte/transition
- Svelte motion docs: https://svelte.dev/docs/svelte/svelte-motion
- Svelte source, transitions: https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/internal/client/dom/elements/transitions.js (read locally at `node_modules/svelte` 5.57.1)
- Svelte source, Spring: https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/motion/spring.js
- Svelte issue #10717: https://github.com/sveltejs/svelte/issues/10717
- Apple, `Spring.init(duration:bounce:)`: https://developer.apple.com/documentation/swiftui/spring/init(duration:bounce:)
- Apple, `Animation.smooth` / `.snappy` / `smooth(duration:extraBounce:)`: https://developer.apple.com/documentation/swiftui/animation/smooth, https://developer.apple.com/documentation/swiftui/animation/snappy, https://developer.apple.com/documentation/swiftui/animation/smooth(duration:extrabounce:)
- WWDC23 "Animate with springs": https://developer.apple.com/videos/play/wwdc2023/10158/
- Motion spring generator (reference only): https://github.com/motiondivision/motion/blob/main/packages/motion-dom/src/animation/generators/spring.ts
- Tauri Windows installer: https://v2.tauri.app/distribute/windows-installer/
- WebView2 distribution: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
