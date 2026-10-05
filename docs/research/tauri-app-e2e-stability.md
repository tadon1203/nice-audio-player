# Research: a more stable way to do app-level e2e (Tauri 2.11.5, WDIO + tauri-service, Windows)

Question: the Meter e2e counts binary `Channel` messages by patching `window.__TAURI_INTERNALS__.transformCallback`, and uses text selectors that do not combine with CSS. What is a sturdier approach?

Research date: 2026-10-05. Primary sources only. Statements are **[verified]** (read in the cited source) or **[inference]**. Complements [tauri-e2e-testing.md](./tauri-e2e-testing.md), which covers which test layers Tauri supports.

## Conclusion

- Do not hook Tauri internals. `transformCallback`, `callbacks`, `runCallback` are defined as non-writable properties and are not public API; the public surface is `Channel`, `invoke`, `listen`.
- For the Meter test, count frames at a seam this repo owns: a counter the renderer bumps in the Meter feed, compiled in only when `VITE_E2E` is set (already set by `wdio.conf.ts`), read with `browser.execute`. It exercises the real path (backend send, Channel, renderer decode).
- Optionally add a `wdio`-feature-only Rust command reporting subscription state, to assert "stopped" at the source.
- Selectors: prefer stable `aria-label` / `role` / `data-testid` attributes with CSS, and chain (`$(a).$(b)`); keep `button=Text` only as the last step of a chain.
- Trade-off: a small amount of test-only code in the app, in exchange for no dependency on Tauri or WDIO private details.

## 1. What Tauri supports, and Windows limits

- Official e2e is WebDriver. "The recommended way to use it with Tauri is WebdriverIO and the `@wdio/tauri-service`", with an embedded WebDriver server (default) or `tauri-driver`. https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/Tests/WebDriver/index.mdx **[verified]**
- Other layers: `mockIPC` for frontend unit tests, and the Rust mock runtime. https://v2.tauri.app/develop/tests/ and the longer table in [tauri-e2e-testing.md](./tauri-e2e-testing.md) **[verified]**
- Windows: `tauri-driver` needs a version-matched `msedgedriver`; a mismatch can hang the connection. https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/Tests/WebDriver/manual-setup.mdx **[verified]**. The service manages the Edge driver (`node_modules/@wdio/tauri-service/docs/edge-webdriver-windows.md`) **[verified, not re-read in depth]**.
- Browser mode (plain Chrome plus mocked `invoke`) is "not suitable" for real command round-trips and has no `browser.tauri.execute()`: `node_modules/@wdio/tauri-service/docs/api-reference.md:43` **[verified]**. It cannot test Channel delivery.
- `tauri-driver` is pre-alpha: https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-driver/README.md **[verified]**.

## 2. Why the current hook is brittle

- `~/.cargo/registry/src/*/tauri-2.11.5/scripts/core.js:51-53` defines `transformCallback` with `Object.defineProperty(..., { value: registerCallback })` only, so it is non-writable and non-configurable. Same for `runCallback` (:59-61) and `callbacks` (:64-66), the last commented "This is just for the debugging purposes". **[verified]** The current test hooks `callbacks.get`, which works only because the Map object is mutable; it depends on `runCallback` reading that Map (an implementation detail). **[inference]**
- `@tauri-apps/api` 2.11.1 `core.js:74-116`: `Channel` wraps each message as `{ index, message }` / `{ index, end }` before the user callback, so raw callback traffic differs from what the app sees (the test already unwraps `.message`). **[verified]**

## 3. Supported ways to observe traffic

1. **Public API from the page.** `browser.tauri.execute(({ core }) => core.invoke(...))` runs with Tauri APIs injected; strings and args are allowed (`api-reference.md:9-39`). Needs `tauri-plugin-wdio` and `withGlobalTauri: true` (`plugin-setup.md:122-127`; the repo's `src-tauri/tauri.e2e.conf.json:3` already sets it). **[verified]**
2. **A test-only backend command or counter.** A command is the normal way to expose backend state; `Channel::send` / `id` are the Rust public API (`tauri-2.11.5/src/ipc/channel.rs:287,292`). Gate it behind the existing `wdio` cargo feature (`src-tauri/Cargo.toml:26`; `lib.rs:31-34` already switches on it). Call it with `browser.tauri.execute(({core}) => core.invoke("e2e_meter_stats"))`. **[verified]** that the pieces exist; the command itself is a proposal. It sees what the backend sent, not what the renderer received.
3. **A renderer-side counter behind a build flag.** `meter-feed.svelte.ts` is the single place that constructs the `Channel` and receives `message`; a counter there (guarded by `import.meta.env.VITE_E2E`) observes exactly what the app consumes. Read with `browser.execute`. **[inference]**: no source prescribes this; it is plain app instrumentation.
4. **tauri-service mocking** (`browser.tauri.mock`) intercepts `invoke` on the JS side via `window.__wdio_mocks__` (`plugin-setup.md:118`). It replaces commands rather than observing a real Channel. Not useful here. **[verified]**
5. **Events**: `browser.tauri.emitEvent` emits into the app (`api-reference.md:47-55`); it does not report what the backend emitted. **[verified]**

## 4. Selectors

- WDIO docs: "You can't mix multiple selector strategies in one selector. Use multiple chained element queries" (Element with Certain Text); chaining narrows queries (Chaining Selectors). https://webdriver.io/docs/selectors **[verified, via summarizer]**. So `section[...] button=Text` is invalid by design; `$("section[...]").$("button=Text")` is valid (the repo already does this).
- The same page's recommendation table rates text selectors (`button=Submit`) "Always", `aria/` "Good", and `data-testid` "Good" but "not connected to a11y". `aria/` uses the accessibility tree on BiDi and "falls back to XPath" on classic sessions. **[verified, via summarizer; the table wording is paraphrased]**
- **[inference]** Text selectors break on copy or i18n changes; the repo's `aria-label` CSS selectors (`button[aria-label="Next track"]`) are stable and already a11y-meaningful. Where the label is unavailable, add `data-testid` rather than relying on duplicate labels (the dock's "Now Playing" collision already forced a tag-based workaround).
- Asserting `span=-inf` is a display-text check. If the Meters readout were exposed as `role="meter"` with `aria-valuenow`/`aria-valuetext`, the test could assert that instead. **[inference]**

## 5. Recommendation for the Meter test

1. Delete the `callbacks.get` patch.
2. In `meter-feed.svelte.ts`, under `if (import.meta.env.VITE_E2E)`, increment `window.__e2e.meterFrames` per decoded frame (one line in the channel callback).
3. Test: open Meters, `waitUntil` the counter exceeds N, switch to Queue, read the counter, wait, assert it did not change. Same shape as now; no private APIs.
4. If the stop assertion needs backend truth, add a `wdio`-only command returning the live subscription count and assert it is 0 after closing.
5. Replace remaining text selectors with chained `aria-label`/`role` queries; add `data-testid` only where no accessible name exists.

Trade-offs: (3) adds a few test-only lines to the renderer but covers backend, Channel and renderer; (2) adds a Rust command but sees only the sender; hooking internals costs nothing in app code but breaks on Tauri upgrades (it already broke once on 2.11.5). A Tauri upgrade should be checked by running `pnpm test:e2e:app`, since nothing in a type system guards the internals.
