# Product

<!-- impeccable:product-schema 1 -->

## Document responsibility

This document is the source of truth for product purpose, users, operating context, and durable product constraints. Accepted behavior belongs in `docs/requirements.md`; visual decisions belong in `DESIGN.md`; system structure belongs in `docs/architecture.md`.

## Platform

Windows 11 desktop application.

## Users

People managing and listening to a local audio library.

## Product Purpose

Nice Audio Player provides stable playback and local-library browsing. Users should be able to find, inspect, and play their own music without the interface obscuring playback state or modifying source data.

## Operating Context

The product runs as an Electron desktop application with a React renderer, a narrow Preload bridge, an Electron Main process, and a Rust/NAPI backend. Library data and source audio remain local unless an explicitly accepted external feature is enabled.

## Capabilities and Constraints

- Supported library presentations are Albums, Album Artists, and Tracks.
- Album Artists support drill-in to their Albums.
- Each presentation retains its own filter and scroll context.
- Playback stability has priority over visual work.
- The application remains usable across ordinary desktop sizes and Windows display scaling.
- Source audio and metadata files are not modified by the application.

## Brand Commitments

The product name is Nice Audio Player. The permanent interface is dark, mostly monochrome, precise, compact where comparison matters, and artwork-led where imagery matters.

## Evidence on Hand

- Accepted behavior: `docs/requirements.md`
- Visual and interaction rules: `DESIGN.md`
- System boundaries: `docs/architecture.md`
- Existing native implementation under `backend/` and cross-process contracts under `src/shared/`

## Accessibility & Inclusion

The application follows WCAG AA minimums, maintains visible keyboard focus, supports keyboard navigation, and remains usable with reduced motion, forced colors, text enlargement, and Windows display scaling.
