# 0006: Three durations, one easing, and one spring for interruptible motion

Superseded by [0007](./0007-one-spring-curve-generated-in-house.md). It superseded [0005](./0005-springs-for-all-motion-with-three-exceptions.md). The current rules are in 0007.

Motion used three durations (`feedback` 100ms, `move` 300ms, `large` 420ms) with one ease-out curve. Svelte's `Spring` (`settle`) drove only the values that retarget while moving. 0007 explains why this was replaced.
