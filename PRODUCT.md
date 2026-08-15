# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary listener uses a Windows desktop for focused listening to a personally owned local music library. They may maintain a large collection and expect browsing, album selection, and playback control to remain fast and unobtrusive. The product supports attentive listening without demanding attention itself.

## Product Purpose

Nice Audio Player is a Windows desktop application for reliable, high-quality playback and management of local audio files. It enables people to browse their collection, select albums, and control playback directly while preserving a calm listening experience. Success means playback remains dependable, responsive, and truthful to the underlying audio state, including with large libraries.

## Positioning

A dependable, local-first Windows music player centered on reliable high-quality playback, ownership of a personal library, and clear direct control. It distinguishes itself through a restrained, artwork-led desktop experience, strong handling of large local libraries, non-destructive treatment of user files, and minimal dependence on external services. It does not imitate streaming-service engagement patterns or generic SaaS UI conventions.

## Operating Context

Listeners use the application at a Windows desktop while browsing, selecting, and playing music from their own local collection. Focused playback, album selection, and direct playback control are the central workflows.

## Capabilities and Constraints

- Initial platform: Windows 11 desktop application built with Tauri v2, Rust, React, TypeScript, Vite, and Tailwind CSS.
- Supported initial audio formats: MP3, FLAC, WAV, AAC, and M4A, subject to validation and decoding.
- Playback prioritizes reliability and high quality; audio stability takes precedence over visual work.
- The product supports direct playback controls, queue playback, repeat and shuffle, volume and mute, output-device selection, and shared output mode.
- Local-library capabilities include registered music folders, indexing, search, sorting, filtering, and available track, album, artist, playlist, recent, and favorite views.
- User files and metadata are never modified without explicit user action. Missing files are represented without destructive automatic actions.
- External services are optional, explicitly enabled, attributable, and must not prevent local playback.
- Authoritative audio and persistent application state live in Rust; React owns presentation and temporary interaction state.

## Brand Commitments

The product name is Nice Audio Player. It commits to a restrained, artwork-led desktop experience that remains unobtrusive during attentive listening. New UI surfaces are built code-first against the existing design system and normative `DESIGN.md`; visual comps are reserved for genuinely new or ambiguous surfaces.

## Evidence on Hand

- Accepted requirements: `docs/requirements.md`
- Implementation boundaries: `docs/architecture.md`
- Normative visual system: `DESIGN.md`
- Existing React/Tauri application implementation and associated test suite in this repository

No customer testimonials, external benchmarks, pricing claims, or third-party product endorsements are on hand and must not be fabricated.

## Product Principles

- Make locally owned music dependable and immediately controllable.
- Protect listening focus: the interface supports attention rather than competing for it.
- Preserve user ownership through local-first, non-destructive file handling.
- Keep large libraries fast to browse and responsive to operate.
- Let playback truth and audio stability outrank secondary visual or service-driven behavior.

## Accessibility & Inclusion

The desktop interface must remain usable at common Windows display-scaling levels and across ordinary desktop window sizes. At 100%, 125%, 150%, and 200% scaling, text must not clip, controls must not overlap, and focus indicators must remain visible.
