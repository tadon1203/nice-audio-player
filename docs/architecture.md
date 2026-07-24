# Architecture

This document defines the implementation rules and module boundaries for Nice Audio Player.

It focuses on responsibilities, dependency direction, state ownership, real-time constraints, IPC, concurrency, persistence, security, and testing boundaries. It is not a feature overview; product behavior belongs in `requirements.md`, while visual and interaction rules belong in `ui-design.md`.

## 1. Architectural Principles

- Rust owns playback, audio processing, library persistence, providers, credentials, and long-running background work.
- React owns presentation, navigation, forms, and user interaction.
- Rust is the source of truth for playback state.
- The audio engine must remain independent from the UI, database, providers, and Tauri command implementations.
- Real-time code must be bounded, non-blocking, and allocation-conscious.
- Modules communicate through explicit interfaces and typed data.
- Infrastructure implementations must remain replaceable.
- External providers must not leak provider-specific models into unrelated modules.
- Background work must support explicit ownership, cancellation, and shutdown.
- Generated files under `src-tauri/gen/` must not be edited manually.

## 2. System Boundaries

The application is divided into the following layers:

```text
React UI
    ↓ typed frontend API
Tauri commands and events
    ↓
Application services
    ↓
Domain modules and interfaces
    ↓
Infrastructure implementations
```

Infrastructure includes:

- Audio devices
- Audio decoders
- Filesystem access
- SQLite
- Credential storage
- External HTTP providers
- Image processing

Dependency direction must move inward toward application and domain interfaces.

Domain modules must not depend on React, Tauri, SQL implementations, operating-system APIs, or provider-specific implementations.

## 3. Module Responsibilities

### 3.1 Playback

The playback module owns:

- Playback state machine
- Current track
- Playback queue
- Queue ordering
- Previous and next behavior
- Repeat behavior
- Shuffle behavior
- Gapless sequencing
- Playback completion
- Playback-history decisions

It coordinates the audio engine through an explicit interface.

It must not:

- Decode files directly
- Open audio devices directly
- Execute SQL directly
- Send Tauri events directly
- Depend on React types

### 3.2 Audio Engine

The audio engine owns:

- Audio output-device discovery
- Output configuration
- Stream creation
- Stream shutdown
- Device error handling
- Decoder coordination
- PCM buffering
- Sample conversion
- Channel conversion
- Seeking support
- Volume gain
- Loudness-normalization gain
- Real-time playback position
- Real-time meter snapshots

It must not depend on:

- React
- Tauri commands
- SQLite
- Lyrics
- Artwork
- External providers
- Library presentation models

The audio engine exposes stable application-facing interfaces rather than CPAL- or decoder-specific types.

### 3.3 Decoder

The decoder module owns:

- Opening supported audio files
- Selecting an audio track
- Reading codec parameters
- Decoding packets
- Converting decoded samples into the internal PCM representation
- Reporting duration and stream information
- End-of-stream handling
- Decoder error conversion

Decoder-specific types must remain inside the decoder infrastructure boundary.

The decoder must run outside the audio callback.

### 3.4 Library

The library module owns:

- Registered music folders
- File discovery
- Incremental scanning
- Change detection
- File identity
- Missing-file handling
- Metadata normalization
- Duplicate detection
- Library queries
- Playlist operations
- Smart-playlist evaluation

Scanning must be separated from audio playback.

Library scanning must not directly manipulate React state or invoke UI code.

### 3.5 Metadata

The metadata module owns:

- Reading embedded metadata
- Normalizing metadata values
- Application-level metadata overrides
- Preparing explicit file-write operations
- Mapping source metadata into domain models

File metadata writes must require explicit user intent.

Metadata readers and writers must not expose library-specific database models.

### 3.6 Analysis

The analysis module owns:

- Loudness measurement
- ReplayGain-compatible values where supported
- Peak measurement
- RMS measurement
- True-peak measurement where supported
- FFT input preparation
- Waveform summaries
- Cached analysis results

Long-running analysis must:

- Run outside the audio callback
- Expose progress where useful
- Support cancellation
- Avoid blocking interactive playback

Real-time meter snapshots may be produced by bounded audio-engine logic, but expensive analysis must run elsewhere.

### 3.7 Lyrics

The lyrics module owns:

- Provider registry
- Local sidecar lyrics
- Embedded lyrics
- Lyrics parsing
- Synchronized lyric timing
- Candidate matching
- Provider priority
- Cache policy
- User overrides
- Timing offsets
- Attribution metadata

Provider-specific implementations must remain behind a shared lyrics-provider interface.

The lyrics module must not depend on playback internals beyond stable track identity and timing information.

### 3.8 Artwork

The artwork module owns:

- Embedded artwork
- Folder artwork
- User-selected artwork
- External artwork providers
- Artwork caching
- Image normalization
- Fallback artwork
- Palette extraction
- Attribution metadata

Artwork decoding, resizing, and palette extraction must run outside playback-critical paths.

Artwork processing must not delay audio startup.

### 3.9 Database

The database module owns:

- SQLite connection management
- Migrations
- Transactions
- Repository implementations
- Query pagination
- Persistent model mapping
- Batched writes

Other modules access persistence through repository interfaces.

React and Tauri commands must not execute SQL directly.

Database models must not become shared application-wide transport types.

### 3.10 Credential Store

The credential-store module owns:

- Saving credentials
- Replacing credentials
- Reading credentials for provider use
- Deleting credentials
- Operating-system credential integration
- Mapping credential-store failures into application errors

Stored secret values must never be returned to React.

The frontend may receive only a credential status.

Credentials must not be included in:

- Logs
- Error messages
- Database records
- Plain-text settings
- Debug output
- Serialized Tauri events

### 3.11 Provider Registry

The provider registry owns:

- Available provider definitions
- Enabled state
- Provider priority
- Capability information
- Provider construction
- Provider configuration validation

Lyrics and artwork providers should use separate interfaces unless a shared abstraction provides clear value without coupling unrelated behavior.

One provider failure must not prevent other providers from running.

### 3.12 Tauri Commands

Tauri commands are transport adapters.

Each command should:

1. Accept a typed request
2. Validate transport-level input
3. Call an application service
4. Convert the result into a stable response type
5. Return a structured error when necessary

Tauri commands must not contain substantial business logic.

Commands must not:

- Execute SQL directly
- Control CPAL directly
- Hold long-lived playback state
- Return infrastructure-specific types
- Return stored credential values

### 3.13 Tauri Events

Tauri events are used for asynchronous notifications such as:

- Playback-state changes
- Track changes
- Low-frequency playback-position updates
- Library-scan progress
- Analysis progress
- Device changes
- Provider status

Events must use stable, typed payloads.

High-frequency PCM, FFT, waveform, peak, or RMS data must not be sent as large JSON event streams.

Event producers must avoid unbounded queues.

### 3.14 React UI

React owns:

- Routing and navigation
- Layout
- Forms
- Settings screens
- Library presentation
- Queue presentation
- Dialogs
- Menus
- User-visible loading states
- User-visible error states
- Accessibility behavior
- Temporary UI interaction state

React must not own authoritative playback state.

React state and context must not store per-frame:

- PCM samples
- FFT bins
- Waveform samples
- Peak values
- RMS values

Components should consume stable frontend-facing models rather than Rust infrastructure details.

### 3.15 Visualizer Worker

The visualizer worker owns:

- `OffscreenCanvas` rendering where supported
- Spectrum drawing
- Waveform drawing
- Meter drawing
- Frame interpolation
- Frame timing
- Reusable typed arrays
- Reusable canvas resources
- Render-performance metrics

The worker keeps only the newest relevant analysis snapshot.

Older snapshots must be replaced or discarded rather than queued.

The worker must not call React for every rendered frame.

## 4. Dependency Rules

Allowed dependency direction:

```text
UI
→ Frontend adapters
→ Tauri transport
→ Application services
→ Domain interfaces
← Infrastructure implementations
```

Rules:

- UI may depend on frontend API adapters and frontend transport types.
- Tauri adapters may depend on application services.
- Application services may coordinate domain interfaces.
- Infrastructure modules may implement domain interfaces.
- Domain modules must not depend on Tauri, React, SQL implementations, CPAL, or provider-specific HTTP models.
- Playback may depend on an audio-engine interface, not its concrete implementation.
- Library may depend on repositories, not SQLite directly.
- Lyrics and artwork may depend on provider interfaces, not concrete providers.
- Providers must not depend on UI components.
- Database code must not call audio or UI modules.
- Circular dependencies are not allowed.

Shared modules should contain stable primitives and contracts, not miscellaneous utilities.

## 5. State Ownership

Authoritative state is owned as follows:

| State                  | Owner                             |
| ---------------------- | --------------------------------- |
| Playback status        | Rust playback module              |
| Current track          | Rust playback module              |
| Queue                  | Rust playback module              |
| Audio stream           | Audio engine                      |
| Device configuration   | Audio engine and settings service |
| Library records        | SQLite through repositories       |
| Playlists              | Library module and repositories   |
| Analysis results       | Analysis module and repositories  |
| Lyrics selection       | Lyrics module                     |
| Artwork selection      | Artwork module                    |
| Provider configuration | Rust settings service             |
| Credentials            | Credential store                  |
| Navigation state       | React                             |
| Open dialogs and menus | React                             |
| Form drafts            | React                             |
| Visualizer frame state | Visualizer worker                 |

The UI may use optimistic interaction only when reconciliation with authoritative Rust state is defined.

## 6. Real-Time Audio Rules

The audio callback must not:

- Access files
- Access the database
- Make network requests
- Send Tauri events
- Serialize data
- Log
- Allocate large objects
- Perform unbounded allocation
- Wait on a blocking mutex
- Wait for another thread
- Run FFT analysis
- Run loudness analysis
- Decode artwork
- Parse metadata
- Call provider code

The callback should only perform bounded operations such as:

- Reading prepared PCM data
- Applying simple gain
- Applying bounded sample conversion
- Writing output samples
- Updating lightweight lock-free or wait-free metrics
- Signaling buffer state through non-blocking mechanisms

Underrun handling must be predictable and must not introduce blocking work.

## 7. Buffering Rules

- Decoding must happen outside the audio callback.
- PCM data must be prepared before the callback consumes it.
- Buffer capacity must be bounded.
- Buffer ownership must be explicit.
- Old data must not accumulate indefinitely.
- End-of-stream must be represented explicitly.
- Cancellation must not leave producer or consumer threads blocked.
- Reusable buffers are preferred in hot paths.
- Per-sample or per-frame heap allocation should be avoided.
- Shared mutable buffers require a design that does not block the audio callback.

## 8. IPC Rules

- Use commands for request-response operations.
- Use events for asynchronous state changes.
- Define explicit request and response types.
- Validate paths, identifiers, ranges, and provider inputs.
- Do not expose Rust infrastructure types directly.
- Do not stream raw PCM through normal Tauri JSON events.
- Do not tie ordinary event frequency to the audio sample rate.
- Do not tie React state updates to the display refresh rate.
- Use compact analysis snapshots.
- Prefer latest-value delivery for visualization data.
- Include versioning or compatibility consideration before changing public command or event contracts.

## 9. Error Handling

Errors should be converted at module boundaries.

Infrastructure errors must not leak directly into UI-facing contracts.

Application errors should be structured and distinguish cases such as:

- Invalid input
- Unsupported format
- Corrupted audio
- Missing file
- Device unavailable
- Device disconnected
- Database failure
- Provider unavailable
- Invalid credential
- Network failure
- Cancelled operation
- Internal failure

User-facing messages must be actionable and must not expose secrets.

Recoverable errors must not crash the application.

Provider failures must not interrupt local playback.

Error logs may include structured context, but must not include:

- Credentials
- Tokens
- Full provider responses containing secrets
- Raw audio samples
- Full lyrics unless explicitly required for local debugging
- Sensitive user paths when unnecessary

## 10. Concurrency and Threading

Separate execution paths should be used for:

- Audio output
- Audio decoding
- Library scanning
- Metadata extraction
- Loudness analysis
- Artwork processing
- Provider requests
- Database work
- Visualizer rendering

Every background task must have:

- A clear owner
- A defined lifetime
- A cancellation strategy where applicable
- A shutdown strategy
- An error-reporting path

Background tasks must not outlive the services that own them.

Application shutdown must stop producers before destroying resources consumed by other threads.

Lock ordering must be documented when multiple locks are unavoidable.

The audio callback must not participate in blocking lock ordering.

## 11. Persistence Rules

- Every schema change requires a migration.
- Migrations must be deterministic and versioned.
- Repository interfaces define persistence boundaries.
- Long-running imports and scans should use batched transactions.
- Database transactions should remain as short as practical.
- External provider data must store source information.
- Cached content must preserve required attribution.
- User overrides must remain distinguishable from discovered metadata.
- File writes require explicit user intent.
- Destructive operations require confirmation.
- Persistence failures must not silently discard user data.

Initial file identity may use:

- Normalized path
- File size
- Modification time

Stronger identity methods may be added when required.

## 12. Configuration Rules

Non-secret configuration may be stored in application settings.

Secret configuration must be stored in the credential store.

Configuration access should go through a settings service rather than being read independently by unrelated modules.

Configuration changes that affect active playback must be applied through explicit audio-engine operations.

Invalid configuration must fail with a structured error rather than falling back silently to insecure behavior.

## 13. Security Rules

- Store API keys only through the credential store.
- Never expose saved secrets to React.
- Never commit credentials or `.env` files containing secrets.
- Limit Tauri capabilities to required commands and plugins.
- Treat filesystem paths as untrusted.
- Treat embedded metadata as untrusted.
- Treat lyrics and artwork content as untrusted.
- Treat provider responses as untrusted.
- Validate data before persistence or display.
- Do not weaken content-security or capability settings to simplify development.
- Avoid opening arbitrary paths or URLs without validation.
- Do not include secrets in panic messages or diagnostic output.

## 14. Logging Rules

Logging must:

- Use structured levels
- Avoid secrets
- Avoid high-frequency hot-path output
- Avoid the audio callback
- Include enough context to identify the failing operation
- Avoid logging entire provider responses by default

Debug logging that may expose private paths or metadata must be deliberate and removable.

## 15. Testing Boundaries

Prioritize unit tests for:

- Playback state transitions
- Queue operations
- Repeat and shuffle decisions
- Input validation
- Metadata normalization
- Lyrics parsing
- Lyrics candidate matching
- Provider priority
- Smart-playlist rules
- Sample conversion
- Gain clamping
- Palette correction
- Error conversion

Prioritize integration tests for:

- Repository behavior
- Database migrations
- Tauri command contracts
- Decoder behavior
- Provider adapters
- Credential-store integration where practical
- Library scanning

Real-time audio and visualizer behavior also require:

- Manual testing on Windows
- Device-change testing
- Underrun observation
- Performance profiling
- High-refresh-rate display testing
- Shutdown and cancellation testing

Tests that require physical audio hardware must be isolated from the default unit-test suite where practical.

## 16. Change Rules

Before changing a module boundary:

- Confirm that the existing responsibility cannot contain the behavior cleanly.
- Avoid creating a new layer for a single trivial operation.
- Update this document when ownership or dependency direction changes.
- Update affected tests and transport contracts.

Before changing a public command or event:

- Update all consumers.
- Preserve type safety.
- Document incompatible changes.
- Avoid temporary duplicate contracts unless migration requires them.

Architecture rules must not be bypassed only to complete an issue faster.
