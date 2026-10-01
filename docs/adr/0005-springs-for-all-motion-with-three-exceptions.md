# 0005: All motion is a spring, with three exceptions

Every movement and every change of state (including hover and press color changes and the Light fade) is a fully damped spring (`bounce: 0`). There are three exceptions:

1. **Press** may overshoot (`bounce: 0.25`).
2. **Reduced motion** replaces every movement with a fixed 100ms crossfade (its own `crossfade` token, not a spring).
3. **Progress motion** (the playing position, scan progress) is proportional to time or work done and runs at constant speed.

Before this, `feedback` (100ms) and `light` (400ms) were fixed-duration tweens. A tween that is retargeted mid-flight restarts and jumps; a spring does not. One kind of curve also means one feel and one vocabulary of tokens. `feedback` becomes a spring with `visualDuration` 0.1 and `light` one with 0.4, so lengths stay as they were. Light loses its slow start, which is accepted. Rejected: keeping tweens for "small" things, because the exception list would have no principle behind it.

## Consequences

- CSS no longer owns timing. `--duration-feedback`, `--duration-overlay`, `--ease-out` and `tokens-css.test.ts` go away; hover, press and overlays use motion's `animate()` with the token through the same function that resolves reduced motion. `tokens.ts` is the only definition. Overlays move from 160ms to the `smallMove` spring (0.2s).
- Only motion that is likely to be interrupted and carries position moves to `animate()`, which inherits velocity: Now Playing open/close, the queue panel, the shared-element hand-off reversing, and lyrics scroll. The rest (`Tween` with a spring easing: icons, rolling digits, roving light) keeps restarting at zero velocity, because those movements are too short for the restart to be seen. Revisit if one proves otherwise.
- Meters that follow data (loudness) are smoothed with a spring; they are not progress motion.
