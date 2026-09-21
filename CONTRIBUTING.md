# Contributing

## Document responsibility

This document is the source of truth for engineering conventions, verification, Git, and GitHub workflow. It does not define product behavior, visual design, or system architecture.

## Documentation

Every source document listed in `AGENTS.md` begins with its title and a `## Document responsibility` section. Keep each rule in its owning document and avoid duplication.

## Engineering rules

- Keep each change focused on one logical responsibility.
- Do not weaken type checking, linting, tests, security, accessibility, or performance constraints to make a change pass.
- New or changed product-visible behavior includes automated coverage in the same change.
- Generated NAPI declarations are changed only through `pnpm bindings:update`; `pnpm bindings:check` detects drift.
- Rust remains authoritative for domain and persistent state. Renderer state may cache or mirror backend state but must not replace it.
- TanStack Router is the navigation authority. TanStack Query owns native read caches. Zustand owns renderer-local interaction state.

## Renderer boundaries

- Renderer code under `src/renderer/**` must not import `electron`, `node:*`, or `src/main/**`.
- Renderer access to native capabilities goes through the shared `TElectronAPI` contract and `window.electron`.
- Main validates IPC senders and Zod-validated arguments before invoking the backend.
- Direct DOM mutation is prohibited; use React rendering and event handlers.
- Use semantic HTML and preserve visible keyboard focus, logical focus order, and WCAG AA contrast.

## Design system

- `src/app/renderer/styles.css` owns the shadcn semantic variables, `@theme inline` adapters, font theme value, and global base styles.
- Product surfaces use shadcn semantic tokens such as `background`, `foreground`, `muted`, `border`, `input`, `ring`, and `destructive`; product code does not use raw palette values for interface surfaces.
- Use shadcn-generated local primitives under `src/renderer/shared/ui/shadcn` and Lucide icons for reusable interaction surfaces. Keep product-specific components and behavior outside that directory. Keep `components.json` and the shadcn CLI configuration in sync with generated components. Add a new primitive with `pnpm exec shadcn add <component>`, then compose it in the owning renderer slice.
- Keep shadcn registry output and its generated `use-mobile` hook in upstream formatting; Oxfmt does not rewrite those generated files. Product compositions and non-generated shared code remain subject to repository formatting.
- Use Tailwind built-in spacing, typography, radius, motion, and z-index utilities before adding a custom `@theme` value. Keep one-component structural values local to that component.
- Do not use gradients, glass, glow, decorative shadows, or oversized headings as substitutes for hierarchy.
- Keep controls at least 14px text and preserve the dark, mostly monochrome, artwork-led visual system defined in `DESIGN.md`.

## Workflow

- Use one Issue, one branch, and one pull request per change.
- Branch names use `<type>/<issue-number>-<kebab-case>`.
- Commit messages use Conventional Commits: `<type>(<scope>): <imperative summary>`.
- Do not push directly to `main` or force-push without explicit authorization.

## Local verification

Use the smallest command that covers the change:

- `pnpm check` — TypeScript, Oxfmt, and Oxlint
- `pnpm test` — Vitest tests
- `pnpm build` — Renderer, Electron, and native production build
- `pnpm test:e2e` — Playwright end-to-end tests
- `pnpm package` — electron-builder package
- `pnpm bindings:check` — generated native contract drift check
- `pnpm fonts:check` — bundled font integrity check
- `pnpm validate` — full repository validation, including native build, tests, E2E, and production build

Run native tests when backend code changes and E2E tests when startup, IPC, routing, or packaged integration changes.
