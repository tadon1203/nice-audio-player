# Nice Audio Player

A Windows desktop application for reliable, high-quality playback of local audio files.

The project is under active development and is built with Tauri v2, Rust, React, TypeScript, Vite, and Tailwind CSS.

## Documentation

- [Requirements](docs/requirements.md): accepted product requirements
- [Architecture](docs/architecture.md): implementation rules and boundaries
- [Design](DESIGN.md): shared visual tokens and interaction principles

Feature proposals, experiments, and implementation scope are tracked in GitHub Issues rather than long-lived documentation.

## Development

Install dependencies:

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
```

Start the desktop application:

```bash
pnpm tauri dev
```

Build the production frontend bundle:

```bash
pnpm build
```

Run the frontend tests once and exit:

```bash
pnpm test
```

Run the real-browser responsive layout tests:

```bash
pnpm test:layout
```

Run all checks before completing a code change:

```bash
pnpm check
```

Format frontend, tooling, and Rust code:

```bash
pnpm format
```

Validate and inspect the project design system with the Stitch-compatible CLI:

```bash
pnpm design:lint
```

`DESIGN.md` is the normative visual reference. Its durable values are manually implemented in
`src/styles/theme.css`; `designmd` is used only to lint the design document.

Source implementation verification:

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm check
```

Install the licensed Fontshare assets manually according to
[`public/fonts/fontshare/README.md`](public/fonts/fontshare/README.md), then verify them with:

```bash
pnpm fonts:check
pnpm tauri dev
pnpm package
```

`pnpm check` validates source code and automated tests without the licensed Fontshare binaries.
`pnpm package` is the supported release command and requires those assets; direct `pnpm tauri build`
is reserved for low-level troubleshooting.

Regenerate or verify the tracked Rust IPC bindings:

```bash
pnpm bindings:generate
pnpm bindings:check
```

Package the desktop application only when an application bundle is explicitly required:

```bash
pnpm tauri build
```

`pnpm check` is the single comprehensive validation command to run before reporting a task
complete or merging a change.

## Generated IPC bindings

Rust Tauri command and IPC type changes require running `pnpm bindings:generate`. The generated
`src/bindings.ts` file is tracked, must not be edited manually, and is checked for staleness by
`pnpm check`. Keep `tauri-specta`, `specta`, and `specta-typescript` pinned to their exact
coordinated versions and upgrade them together.
