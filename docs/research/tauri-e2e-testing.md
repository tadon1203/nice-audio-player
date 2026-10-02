# Research: how Tauri apps are tested, and is a mocked-IPC browser E2E suite the usual arrangement?

Question (from the user, originally Japanese): "Is it common for a Tauri app's test setup NOT to have tests that run through the real app (real Rust backend)? Is mocking IPC in a browser-driven E2E suite the common arrangement, with real-app tests rare or absent?"

Research date: 2026-10-02. Sources are primary only (Tauri docs source, tauri-apps repos, Playwright docs, Microsoft WebView2 docs). Statements are marked **[verified]** (read in the cited source) or **[inference]**.

## Answer

**Short answer: partly yes.** Mocked-IPC, renderer-only testing is a first-class, officially documented layer, and in the few open-source Tauri apps I sampled I found no real-app E2E harness. But I cannot show from primary sources that this is "the common arrangement". Real-app E2E is officially supported and documented (WebDriver via WebdriverIO or `tauri-driver`), and Tauri's own repo runs it. So "rare or absent" is a plausible reading of a small sample, not a verified statistic.

- Verified: Tauri documents three layers: mockIPC unit tests, a Rust mock runtime, and WebDriver E2E against the real app. A mocked-IPC browser suite is not an anti-pattern; WebdriverIO's Tauri service ships an equivalent "browser mode" that does exactly this and says it is "not suitable" for "real command round-trips to a running Rust backend".
- Verified: real-app E2E on Windows works via `tauri-driver` + `msedgedriver` (or the WDIO embedded driver). It is not on macOS via `tauri-driver`.
- Not verified: how many Tauri apps do real-app E2E. My sample (8 repos, below) is too small and unscientific to call anything "common".
- Playwright over CDP to WebView2 is documented by Playwright, with caveats; Tauri's docs do not mention it.

Confidence: high on what is officially supported and on the platform limits; medium-low on "what is common in practice".

## Findings

### 1. What Tauri officially recommends, per layer

| Layer                              | What it is                                                                                                                                                                                           | Source                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend unit tests with `mockIPC` | Fake `invoke` in a JS test runner (Vitest example); "common" per the docs; asserts which backend calls are made and simulates results                                                                | [mocking.mdx](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/Tests/mocking.mdx) **[verified]**                               |
| Rust tests with the mock runtime   | `tauri::test` ("Utilities for unit testing on Tauri applications", "This module is unstable"): `mock_builder`, `mock_context`, `get_ipc_response`; exercises command handlers without a real webview | [crates/tauri/src/test/mod.rs](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/src/test/mod.rs) **[verified]**                                |
| E2E with WebDriver                 | Real app binary, real webview, real Rust backend                                                                                                                                                     | [develop/Tests/WebDriver/index.mdx](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/Tests/WebDriver/index.mdx) **[verified]** |

Details:

- The Tests overview says Tauri "offers support for both unit and integration testing utilizing a mock runtime. Under the mock runtime, native webview libraries are not executed", and "also provides support for end-to-end testing utilizing the WebDriver protocol" ([Tests/index.mdx](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/Tests/index.mdx)). **[verified]**
- The recommended E2E route is now WebdriverIO plus `@wdio/tauri-service`: "The recommended way to use it with Tauri is WebdriverIO and the `@wdio/tauri-service`, which works on Windows, Linux, and macOS" ([WebDriver/index.mdx](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/Tests/WebDriver/index.mdx)). It runs an embedded WebDriver server inside the app by default (needs the `tauri-plugin-wdio-webdriver` plugin), or can use `tauri-driver`, or CrabNebula's fork. **[verified]**
- The service also offers command (IPC) mocking in real-app mode, and a "browser mode" that "runs your Tauri frontend in plain Chrome against a Vite dev server — no Tauri binary, driver, or plugin required. It intercepts `invoke()` calls" (same WebDriver-index page). Its own doc says browser mode is "a frontend-only test mode... the Tauri Rust backend is replaced by mocks", suited to "renderer-focused" tests, and "not suitable" when asserting "real command round-trips to a running Rust backend" ([browser-mode.md](https://github.com/webdriverio/desktop-mobile/blob/main/packages/tauri-service/docs/browser-mode.md)). **[verified]** This is essentially this repo's current arrangement, and it is blessed as a legitimate renderer-level layer, not as a replacement for real-app tests.
- `mockIPC` doc caveats: event mocking is partial (`emitTo` / `emit_filter` unsupported; partial support since 2.7.0), per the rendered page https://v2.tauri.app/develop/tests/mocking/ (fetched through a summarizer; the raw MDX in the table above is the authoritative text for the rest). **[verified, summarizer-mediated for the event caveat]**
- Tauri's own repo has a real-app E2E suite: `packages/api-e2e` — "WebdriverIO suite that exercises every `@tauri-apps/api` module against a **real** Tauri app ... rather than a mocked backend, on desktop (Linux, macOS, Windows) and mobile" ([README](https://github.com/tauri-apps/tauri/blob/dev/packages/api-e2e/README.md), CI: [.github/workflows/test-api-e2e.yml](https://github.com/tauri-apps/tauri/blob/dev/.github/workflows/test-api-e2e.yml)). **[verified]** Note the target is Tauri's example app that validates the API, not a user-facing product.

### 2. Platform limits

- `tauri-driver` is labelled "_(pre-alpha)_"; supports Linux via `WebKitWebDriver` and Windows via Microsoft Edge Driver; macOS is a "**[Todo]**" ([crates/tauri-driver/README.md](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-driver/README.md)). **[verified]**
- Driven directly, "only Windows and Linux are supported on desktop, as macOS has no WKWebView driver tool available" ([manual-setup.mdx](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/Tests/WebDriver/manual-setup.mdx)). macOS is reachable only via the WDIO embedded driver or CrabNebula's paid fork (WebDriver/index.mdx above). **[verified]**
- Windows: you need an `msedgedriver.exe` matching the installed Edge/WebView2 version, on `PATH` or via `--native-driver`; "If the two versions do not match, you may experience your WebDriver testing suite hanging while trying to connect" (manual-setup.mdx). Microsoft says the same about matching the WebView2 Runtime ([Microsoft Edge WebDriver with WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver)). The WDIO service says it keeps the Edge driver in sync for you (WebDriver/index.mdx). **[verified]**
- Tauri's own suite comment: on Windows msedgedriver passes `--remote-debugging-port` to the app via `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, "which WebView2 ignores in an elevated process ([wry#1782](https://github.com/tauri-apps/wry/issues/1782)), so the suite has to run unelevated" ([api-e2e README](https://github.com/tauri-apps/tauri/blob/dev/packages/api-e2e/README.md)). **[verified]** (I did not open wry#1782 itself.)
- Tauri's own `packages/api-e2e/wdio.conf.ts` runs serially: "The driver spawns a single app instance ... so the suite must run serially" ([file](https://github.com/tauri-apps/tauri/blob/dev/packages/api-e2e/wdio.conf.ts)). **[verified]** Relevant when comparing to Playwright's `fullyParallel`.

### 3. Common in practice vs. merely possible

What is **verified**:

- Real-app E2E is possible and documented on all three desktop OSes (section 1/2), and used in Tauri's own repo (`packages/api-e2e`, also present in [tauri-apps/plugins-workspace](https://github.com/tauri-apps/plugins-workspace/tree/v2/packages/api-e2e) by repo tree listing). There is a dedicated example repo, [tauri-apps/webdriver-example](https://github.com/tauri-apps/webdriver-example) ("Simple Tauri application with WebDriver tests", `v1` and `v2` folders).
- The official docs list mock-based unit testing first and describe it as "common" (mocking.mdx: "having a 'fake' Tauri environment ... is common"). That is a statement about mocking, not about the share of apps skipping real E2E.

What is **a small-sample observation, not a general claim**. I listed the file trees (via `gh api .../git/trees/<branch>?recursive=1`, 2026-10-02) of 8 popular Tauri repos and looked for `playwright`, `wdio`, `webdriver`, `tauri-driver`, `selenium`, `cypress`, `mockIPC` in paths:

- No such harness config found in: clash-verge-rev, Cap (desktop app; its only Playwright config is `apps/chrome-extension/playwright.config.ts`, a browser extension, not the Tauri app), yaak, Pake, spacedrive (hits were only Cypress file-type icons), hoppscotch (not primarily a Tauri app), BongoCat, lencx/ChatGPT.
- Code-search counts (GitHub code search, query `<term> repo:<repo>`): `mockIPC` 0 hits in clash-verge-rev, Cap, yaak (the rest were cut off by API rate limiting); `tauri-driver` 0 in the same three plus BongoCat and lencx/ChatGPT; BongoCat and lencx/ChatGPT 0 for `@wdio` and `playwright`. clash-verge-rev returned 2 hits each for `@wdio` and `playwright` which I did **not** inspect, so I cannot say whether they are real-app tests. Counts for Pake, spacedrive, hoppscotch were not obtained (rate limit). **[unverified]**
- Most of these repos have unit tests (`*.test.ts`) for TypeScript; I did not check their Rust tests.
- Read this as: in this sample, real-app WebDriver E2E was not evident. It is **[inference]** that real-app E2E is uncommon among popular open-source Tauri apps. Selection bias (popular repos, path/keyword search only, private CI not visible) means it must not be generalized.
- Also an **[inference]**: official positioning ("tauri-driver (pre-alpha)", macOS gap, driver-version friction, serial runs) plausibly explains why teams default to renderer mocks plus Rust unit tests. The sources state the limitations, not the motive.

Mocking via `window.__TAURI_INTERNALS__` directly (this repo's approach) is what `mockIPC` does internally, and what WDIO browser mode does ("patches `window.__TAURI_INTERNALS__.invoke`", browser-mode.md). **[verified]** for browser mode; the `mockIPC` internals I did not read in the API source.

### 4. Playwright + WebView2 over CDP

- Documented by Playwright: set `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` with `--remote-debugging-port=9222`, then `playwright.chromium.connectOverCDP('http://localhost:9222')`, and take the page from the existing context ([playwright.dev/docs/webview2](https://playwright.dev/docs/webview2)). The page is not marked experimental. **[verified]** (fetched via summarizer.)
- Caveats stated there: WebView2 instances share one user data directory by default and interfere under parallel tests, so set a unique `WEBVIEW2_USER_DATA_FOLDER` per test; wait for the control to finish initializing before connecting (same page). **[verified]**
- The page is written for host apps that create a WebView2 control themselves ("`AdditionalBrowserArguments`"). For Tauri, the env var route is the applicable one; Tauri's own suite uses that same variable path under msedgedriver (api-e2e README), so the mechanism is known to work with Tauri/wry on Windows. Whether `connectOverCDP` against a Tauri app works end to end is an **[inference]**: I found no first-party Tauri doc or example for it, and I did not run it.
- Microsoft's WebView2 docs describe `--remote-debugging-port=<port>` as an additional browser argument and use it for the WebDriver "attach" approach (`EdgeOptions.DebuggerAddress = "localhost:9222"`), with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` as the env var / registry equivalent ([WebDriver with WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver)). **[verified]** The wry elevation caveat (wry#1782) applies to this variable: run unelevated.
- Playwright limits over CDP (general, not WebView2-specific) are **[unverified]** here: I did not read Playwright's `connectOverCDP` API page; typically, Playwright-launched browser features (context options like `reducedMotion`, tracing/video completeness) behave differently on an attached browser.
- Playwright cannot start/stop the app itself in this mode; the app launch (with the env vars) is the test harness's job (follows from the docs' flow; **[inference]**).

## What this means for this repo

- A mocked-IPC Chromium E2E suite is an officially recognized layer (WDIO "browser mode" is the same idea), so it is not unusual; the gap is the missing real-app layer, which Tauri supports but does not require, and which I could not show to be common.
- The cargo tests cover the Rust backend; nothing covers the real wiring (command names, serialized shapes, events, WebView2 behavior, the native audio adapter through the real IPC). Real-app E2E is what closes that.
- Cheapest real-app options on Windows, from the sources: (a) WDIO `@wdio/tauri-service` with the embedded driver or `tauri-driver` + matching `msedgedriver`, serial, unelevated; (b) Playwright `connectOverCDP` to the WebView2 launched with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=...` and a unique `WEBVIEW2_USER_DATA_FOLDER` (documented by Playwright, not by Tauri; untested here).
- A small smoke suite (launch the real app, scan a fixture folder, play a track, assert the playback state) would cover the real boundary without replacing the current fast mocked suite. Playing audio in CI also needs an output device, which I did not research.
