# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People using a Windows 11 desktop application to manage and listen to a local
audio library.

## Product Purpose

Nice Audio Player provides stable playback and local-library browsing for
audio files. Success means that users can find, inspect, and play their local
music without the interface obscuring playback state or damaging source data.

## Operating Context

The product runs as an Electron desktop application with an Angular renderer,
an Electron host, and a Rust backend. Library data and source audio remain
local unless an explicitly accepted external feature is enabled.

## Capabilities and Constraints

- Supported library presentations are Albums, Album Artists, and Tracks.
- Album Artists support drill-in to their Albums.
- Each presentation retains its own filter and scroll context.
- Playback stability has priority over visual work.
- The application must remain usable across ordinary desktop window sizes and
  common Windows display-scaling levels.
- Source audio and metadata files are not modified by the application.

## Brand Commitments

The product name is Nice Audio Player. The incumbent visual system is a dark,
artwork-led desktop interface with quiet monochrome application chrome.

## Evidence on Hand

- Accepted behavior: `docs/requirements.md`
- Visual and interaction rules: `DESIGN.md`
- System boundaries: `docs/architecture.md`
- Existing renderer and Electron implementation under `src/`, `electron/`,
  `shared/`, and `backend/`

## Product Principles

- Preserve playback stability while library and visual features evolve.
- Keep local data ownership and renderer/native boundaries explicit.
- Make library navigation, state, and failures understandable.
- Prefer repeatable verification over manual-only confidence.

## Accessibility & Inclusion

The application follows WCAG AA minimums, maintains visible keyboard focus,
supports keyboard navigation, and remains usable with reduced motion, forced
colors, text enlargement, and Windows display scaling.
