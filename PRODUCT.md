# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary listener uses a Windows desktop for focused listening to a personally owned local music
library. They may maintain a large collection and expect browsing, album selection, and playback
control to remain fast and unobtrusive. The product supports attentive listening without demanding
attention itself.

## Product Purpose

Nice Audio Player is a Windows desktop application for reliable, high-quality playback and
management of local audio files. It enables people to browse their collection, select albums, and
control playback directly while preserving a calm listening experience.

Success means playback remains dependable, responsive, and truthful to the underlying audio state,
including with large libraries.

## Positioning

A dependable, local-first Windows music player centered on reliable high-quality playback, ownership
of a personal library, and clear direct control.

It distinguishes itself through a restrained, artwork-led desktop experience, strong handling of
large local libraries, non-destructive treatment of user files, and minimal dependence on external
services.

It does not imitate streaming-service engagement patterns, generic SaaS UI conventions, or the
surface appearance of another operating system.

## Operating Context

Listeners use the application at a Windows desktop while browsing, selecting, and playing music from
their own local collection.

Focused playback, album selection, library navigation, and direct playback control are the central
workflows.

The interface may remain visible for long listening sessions, so persistent UI must stay calm,
legible, predictable, and subordinate to the music.

## Capabilities and Constraints

- Initial platform: Windows 11 desktop application built with Tauri v2, Rust, React, TypeScript,
  Vite, and Tailwind CSS.
- Supported initial audio formats: MP3, FLAC, WAV, AAC, and M4A, subject to validation and decoding.
- Playback prioritizes reliability and high quality; audio stability takes precedence over visual
  work.
- The product supports direct playback controls, queue playback, repeat and shuffle, volume and
  mute, output-device selection, and shared output mode.
- Local-library capabilities include registered music folders, indexing, search, sorting, filtering,
  and available track, album, artist, playlist, recent, and favorite views.
- User files and metadata are never modified without explicit user action. Missing files are
  represented without destructive automatic actions.
- External services are optional, explicitly enabled, attributable, and must not prevent local
  playback.
- Authoritative audio and persistent application state live in Rust; React owns presentation and
  temporary interaction state.
- Accessibility, reduced-motion behavior, forced-color support, and Windows display scaling are
  product requirements rather than optional visual enhancements.

## Brand Commitments

The product name is Nice Audio Player.

It commits to a restrained, artwork-led desktop experience that remains unobtrusive during attentive
listening.

Apple's enduring human-interface philosophy is an explicit design reference for Nice Audio Player.
The product adopts the underlying principles that have remained useful across changes in Apple's
visual language: purpose, user agency, familiarity and consistency, direct manipulation, clear
feedback, spatial continuity, simplicity, and uncompromising craft.

This reference is philosophical rather than stylistic.

Nice Audio Player does not imitate the appearance of macOS, iOS, or any particular generation of
Apple interface design. Apple-specific window chrome, platform controls, typography, symbols,
materials, glass effects, decorative depth, contemporary radii, or other fashion-dependent surface
treatments are not part of the product identity unless independently justified by this product's own
purpose, Windows operating context, and interaction model.

The resulting interface must remain recognizably Nice Audio Player: a dark, local-first Windows
music player whose visual presence recedes behind music, artwork, and direct control.

New UI surfaces are built code-first against the existing design system and normative `DESIGN.md`;
visual comps are reserved for genuinely new or ambiguous surfaces.

## Evidence on Hand

- Accepted requirements: `docs/requirements.md`
- Implementation boundaries: `docs/architecture.md`
- Normative visual system: `DESIGN.md`
- Existing React/Tauri application implementation and associated test suite in this repository

No customer testimonials, external benchmarks, pricing claims, or third-party product endorsements
are on hand and must not be fabricated.

## Product Principles

- Make locally owned music dependable and immediately controllable. Playback truth, audio stability,
  and user ownership outrank presentation.
- Protect listening focus. The interface exists to support music and user intent, not to compete for
  attention.
- Follow the enduring human-interface principles exemplified by Apple: give people agency, use
  familiar and internally consistent behavior, provide immediate and intelligible feedback, and
  remove unnecessary complexity.
- Preserve physical and perceptual truth. Visible change maintains object identity, causal
  direction, spatial relationships, and continuity; direct manipulation responds directly to input
  and remains interruptible.
- Treat simplicity as coherence rather than minimalism. Reduce independent rules and unnecessary
  representation without hiding required function or state.
- Treat beauty and delight as consequences of purpose, hierarchy, proportion, rhythm, precision,
  comprehensibility, and craft — never as decorative layers applied after the interface is designed.
- Let content and music remain primary. UI chrome, motion, material, and ornament must recede unless
  they communicate structure, state, feedback, or an interaction relationship.

## Accessibility & Inclusion

The desktop interface must remain usable at common Windows display-scaling levels and across ordinary
desktop window sizes.

At 100%, 125%, 150%, and 200% scaling:

- text must not clip;
- interactive controls must not overlap;
- focus indicators must remain visible;
- important state must remain identifiable without relying on motion or color alone;
- direct manipulation must remain responsive;
- reduced-motion behavior must preserve state and causality while removing unnecessary spatial
  movement.

Accessibility behavior is part of the product's interaction quality and is not a separate visual mode.
