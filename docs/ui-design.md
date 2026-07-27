# UI Design

This document defines accepted visual and interaction principles for Nice Audio Player.

Product capabilities belong in `requirements.md`; implementation and performance boundaries belong in `architecture.md`; proposed screens and feature-specific UI scope belong in GitHub Issues.

The terms in this document are normative as follows:

- **Must**: required for accessibility, consistency, safety, or an accepted interaction contract
- **Should**: the default design direction unless a tested alternative is better
- **May** or **Suggested**: a starting point to validate during implementation, not a fixed value

## 1. Design Direction

The interface should feel:

- Calm
- Premium
- Precise
- Content-led
- Modern without appearing temporary or trendy
- Suitable for long listening sessions

The main visual inspiration is high-end desktop music software, including the restraint and content focus associated with products such as Apple Music and TIDAL.

The application must not copy proprietary layouts, icons, visual assets, or branding.

Album artwork, typography, lyrics, and audio visualization should remain the primary visual elements.

Decorative interface elements must remain secondary.

## 2. Visual Principles

- Prefer clarity over density.
- Use generous but efficient spacing.
- Use restrained contrast.
- Use deep neutral surfaces instead of featureless pure black.
- Let artwork provide personality.
- Use one artwork-derived accent family at a time.
- Keep inactive controls quiet.
- Make interaction states clear.
- Use blur, glow, transparency, and gradients sparingly.
- Avoid decoration that competes with album artwork or lyrics.
- Avoid unnecessary visual differences between similar components.
- Use semantic design tokens rather than local arbitrary values.

## 3. Information Hierarchy

The visual hierarchy should generally prioritize:

1. Current artwork
2. Track title
3. Artist and album
4. Primary playback controls
5. Lyrics or visualization
6. Queue and secondary metadata
7. Technical information

Important controls must be visually discoverable without making every control equally prominent.

Technical audio information should be available but must not dominate the default listening experience.

## 4. Application Layout

The primary desktop layout may contain:

- Sidebar navigation
- Main content area
- Persistent player bar
- Optional queue panel
- Optional lyrics panel
- Now Playing view
- Full-screen lyrics view
- Full-screen visualizer view

The layout should support:

- Wide desktop windows
- Moderate window widths
- Common Windows scaling levels
- Resizable side panels
- Stable playback-control placement

The interface must not collapse into a dense toolbar when the window becomes narrower.

Secondary content should hide, move, or become scrollable before primary playback controls are compressed excessively.

## 5. Sidebar

The sidebar may contain:

- Home or overview
- Tracks
- Albums
- Artists
- Playlists
- Recently added
- Recently played
- Favorites
- Settings

Sidebar behavior:

- Selected navigation uses a quiet surface change and accent indicator.
- Icons remain visually consistent in size and stroke.
- Labels remain readable at common scaling levels.
- Collapsed mode may be supported later but is not required initially.
- The sidebar must not use strong full-height gradients or permanent glow.

## 6. Main Content

Main content should use:

- Clear page titles
- Optional supporting metadata
- Stable tool placement
- Consistent content margins
- Virtualized lists for large collections
- Content skeletons that preserve final layout dimensions

List and grid views should share selection, focus, and context-menu behavior.

## 7. Player Bar

The persistent player bar should provide:

- Current artwork
- Track title
- Artist
- Previous
- Play or pause
- Next
- Seek progress
- Current time
- Duration
- Volume
- Queue access
- Lyrics access
- Optional output-device access

The central playback action should have the strongest control emphasis.

Less frequent actions should remain visible without receiving equal visual weight.

The player bar must preserve its dimensions while metadata loads or changes.

Long titles must truncate without shifting playback controls.

## 8. Now Playing View

The Now Playing view should emphasize:

- Large artwork
- Track identity
- Playback state
- Lyrics or visualization
- Artwork-derived atmosphere

The view may use a blurred artwork background, but foreground readability must remain stable across all artwork.

The interface should not place excessive technical controls directly around the artwork.

## 9. Color System

Base colors should use deep, slightly tinted neutrals.

Suggested initial tokens:

```css
--color-background: #0a0a0b;
--color-surface: #111113;
--color-surface-raised: #17171a;
--color-surface-hover: rgba(255, 255, 255, 0.06);
--color-border: rgba(255, 255, 255, 0.08);
--color-text-primary: rgba(255, 255, 255, 0.95);
--color-text-secondary: rgba(255, 255, 255, 0.62);
--color-text-muted: rgba(255, 255, 255, 0.38);
```

These values are starting points, not permission to embed raw color values throughout components.

Components must use semantic tokens such as:

- Background
- Surface
- Raised surface
- Border
- Primary text
- Secondary text
- Muted text
- Accent
- Accent hover
- Error
- Warning
- Success
- Focus ring

## 10. Artwork-Based Theming

Artwork processing should produce:

- Primary accent
- Secondary accent
- Highlight color
- Background tint
- Accessible foreground color

Recommended extraction flow:

1. Downscale the artwork.
2. Sample representative pixels.
3. Ignore transparent pixels.
4. Ignore near-black and near-white pixels.
5. Reduce the influence of very low-saturation pixels.
6. Group similar colors.
7. Select primary and supporting colors.
8. Correct excessive saturation.
9. Correct unsafe luminance.
10. Validate contrast.
11. Generate semantic theme tokens.

Fluorescent, extremely saturated, or visually unstable colors must be corrected before use.

Artwork-derived colors must not be used directly when they reduce text or control contrast.

Theme changes should transition smoothly rather than switching instantly.

## 11. Dynamic Background

The Now Playing background may use layered composition:

1. Deep neutral base
2. Enlarged artwork
3. Strong blur
4. Artwork-derived gradient
5. Dark contrast overlay
6. Optional subtle noise
7. Foreground content

Suggested artwork-background treatment:

- Scale: approximately `1.1–1.2`
- Blur: approximately `80–140px`
- Opacity: approximately `0.25–0.45`

The exact values should depend on readability.

Blurred artwork should update only when the active artwork changes.

Background transitions must not cause large repeated image-processing work.

The background must not flash bright colors during track changes.

## 12. Typography

Typography should feel editorial rather than technical.

Rules:

- Track titles receive the strongest emphasis.
- Page headings should not resemble oversized dashboard headings.
- Artist and album names use secondary contrast.
- Supporting metadata uses muted contrast.
- Playback time uses tabular numerals.
- Excessively bold type should be avoided.
- Line lengths for lyrics and text content should remain readable.
- Long titles must truncate gracefully.
- Numeric audio properties should align consistently.

Use a limited type scale.

Avoid using many similar font sizes that do not create a meaningful hierarchy.

## 13. Spacing

Spacing should use a consistent scale.

Suggested base values:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

Rules:

- Related controls remain visually grouped.
- Unrelated groups receive clear separation.
- Dense track rows may use smaller vertical spacing.
- Now Playing and full-screen views may use larger spacing.
- Layout spacing should be controlled by containers rather than arbitrary child margins.

## 14. Shape

Suggested radii:

- Small controls: `8px`
- Standard controls and rows: `10–12px`
- Cards and panels: `14–16px`
- Large floating panels: up to `24px`
- Artwork: `10–16px`

Avoid:

- Applying the same large radius to every element
- Fully rounded controls without a functional reason
- Combining strong border radius, blur, glow, and gradient on the same component

## 15. Borders and Elevation

Borders should remain subtle.

Use elevation primarily for:

- Artwork
- Menus
- Dialogs
- Floating panels
- Dragged elements

Do not apply prominent shadows to every card or row.

Depth should come from a combination of:

- Surface contrast
- Subtle border
- Limited shadow
- Layered positioning

## 16. Buttons

Buttons must define:

- Default
- Hover
- Active
- Focus-visible
- Disabled
- Loading

General behavior:

- Default appearance remains quiet.
- Hover slightly increases surface contrast.
- Pressed state may use a small scale reduction.
- Focus uses a visible accent-aware ring.
- Disabled state remains readable but clearly inactive.
- Loading must preserve button dimensions.

Buttons must not use permanent outer glow.

Primary destructive actions must not resemble ordinary primary actions.

## 17. Playback Controls

The central play or pause control may use:

- Larger size
- Accent background
- Accessible foreground
- Subtle inner highlight
- Controlled play/pause morph

Previous and next controls should remain visually balanced around the central action.

Secondary playback modes such as repeat and shuffle should show clear enabled states without using strong full-button accent fills.

## 18. Sliders

Sliders are used for:

- Seek position
- Volume
- Timing offset
- Optional visualizer settings

Slider behavior:

- Default track remains thin.
- Hover increases track or thumb visibility.
- Dragging slightly increases interaction emphasis.
- The target area must be larger than the visible line.
- Keyboard adjustment must be supported.
- Focus must be visible.
- Progress updates must not cause unnecessary large React rerenders.

The seek slider should distinguish:

- Played range
- Buffered range where available
- Remaining range

## 19. Track Rows

Track rows may display:

- Track number
- Artwork
- Title
- Artist
- Album
- Duration
- Favorite state
- Playback state
- Context menu

Selected rows should use:

- Slightly brighter surface
- Stronger text
- Narrow accent marker
- Restrained accent tint

Avoid full-strength accent backgrounds across entire rows.

The currently playing row must remain distinguishable from keyboard selection.

Hover actions should not cause row content to shift.

## 20. Album and Artist Grids

Grid cards should prioritize artwork.

Rules:

- Artwork sizes remain consistent within a grid.
- Titles truncate predictably.
- Secondary metadata uses lower contrast.
- Hover effects remain subtle.
- Play actions may appear on hover without covering important artwork.
- Missing artwork uses a designed fallback, not an empty placeholder.

Grid density should adapt to window width without creating extremely small artwork.

## 21. Menus and Dialogs

Menus and dialogs should use:

- Raised surfaces
- Subtle borders
- Clear focus order
- Keyboard dismissal
- Predictable placement
- Limited background blur

Dialogs must:

- State the requested action clearly
- Separate primary and secondary actions
- Require explicit confirmation for destructive operations
- Preserve entered data when recoverable errors occur

Context menus should not contain actions unrelated to the selected object.

## 22. Motion

Motion should explain:

- State change
- Navigation
- Hierarchy
- Appearance or removal
- Playback action
- Track or artwork change

Preferred animated properties:

- `transform`
- `opacity`

Avoid animating layout properties in hot or frequently updated paths where transform-based alternatives exist.

Suggested timing:

- Immediate feedback: `120–180ms`
- Standard component transition: `180–280ms`
- Panel transition: `240–360ms`
- Artwork transition: `500–700ms`
- Theme transition: `700–1000ms`

Suggested easing:

```css
cubic-bezier(0.22, 1, 0.36, 1)
```

Strong bounce or spring motion should be rare.

Motion must respect the operating-system reduced-motion preference.

## 23. SVG Icon Animation

SVG morphing is appropriate for a limited set of state transitions:

- Play to pause
- Volume to mute
- Favorite outline to filled
- Expand to collapse
- Queue panel open or closed
- Lyrics panel open or closed

Morphing should generally complete within `180–240ms`.

Icons must not animate continuously while idle.

Icons with unrelated shapes should use a fade or transform transition instead of forced morphing.

## 24. Visualizer

The visualizer should resemble high-end audio instrumentation rather than a gaming or nightclub interface.

The initial primary presentation may combine:

- Smooth spectrum
- Subtle waveform
- Peak and RMS information
- Peak hold
- Minimal frequency or decibel references

Visual rules:

- Prefer fine lines or continuous surfaces over thick equalizer bars.
- Use one or two related accent colors.
- Limit glow.
- Keep grids low contrast.
- Reserve high brightness for meaningful peaks.
- Avoid rainbow coloring.
- Avoid rapid decorative particle effects.
- Avoid flashing backgrounds.
- Preserve visual coherence, but skip or reduce the frequency of stale frames when necessary to protect audio stability.

The visualizer may respond to artwork-derived colors, but contrast and stability take priority over exact palette matching.

Canvas rendering must remain independent from React frame updates.

## 25. Lyrics

Synchronized lyrics should:

- Keep the active line visually dominant
- Reduce contrast for surrounding lines
- Scroll smoothly
- Position the active line slightly above the vertical center
- Keep upcoming lines visible
- Avoid excessive blur
- Support manual timing offset
- Preserve readable line spacing

Transitions between active lines should not use large jumps or strong scaling.

Unsynchronized lyrics should use a readable document-like layout.

Lyrics must remain selectable or editable where the relevant mode permits it.

Provider attribution should remain visible where required without competing with the lyric content.

## 26. Queue

The queue should show:

- Current track
- Upcoming tracks
- Previously played tracks where useful
- Reordering affordance
- Removal actions
- Clear queue action

The current track should remain anchored or easy to locate.

Drag interaction must provide:

- Visible insertion position
- Stable row dimensions
- Clear dragged state
- Keyboard-accessible alternatives where practical

## 27. Search

Search should:

- Respond quickly
- Preserve the query during navigation where useful
- Show result categories clearly
- Highlight meaningful matches without excessive color
- Distinguish empty results from loading
- Support keyboard navigation

Search overlays or pages must not obscure playback controls unnecessarily.

## 28. Loading States

Loading states should preserve layout dimensions.

Use:

- Skeleton text
- Artwork placeholders
- Progress indicators for long-running work
- Clear cancellation controls where supported

Avoid:

- Replacing entire screens with centered spinners
- Shifting controls when content arrives
- Showing indefinite loading without explanation

## 29. Empty States

Empty states should explain:

- What is missing
- Why the screen is empty
- What action the user can take

Examples include:

- No library folders
- No search results
- Empty playlist
- No lyrics
- No artwork
- No available provider result

Empty states should remain visually restrained.

## 30. Error States

Errors should:

- Use plain language
- Explain the failed operation
- Suggest a next action
- Preserve unrelated content
- Avoid alarming visual treatment for minor recoverable failures

Use destructive colors only when appropriate.

Provider errors must not visually replace the entire Now Playing experience.

## 31. Interaction States

Every interactive component must define:

- Default
- Hover
- Active
- Focus-visible
- Selected
- Disabled
- Loading
- Error where applicable

State must not rely on color alone.

Selection, focus, and playback state must remain visually distinct.

## 32. Accessibility

The interface must:

- Support keyboard navigation
- Provide visible focus states
- Provide accessible names for icon-only controls
- Maintain readable text contrast
- Correct artwork-derived colors when contrast is unsafe
- Avoid color-only communication
- Respect reduced motion
- Support common Windows display scaling
- Keep pointer targets large enough
- Preserve readable text at user-selected scaling
- Use semantic HTML where practical
- Announce important asynchronous state changes appropriately

Visualizer content must not be required to understand playback state.

## 33. Design Tokens

Reusable visual decisions should be exposed as tokens for:

- Color
- Typography
- Spacing
- Radius
- Shadow
- Motion duration
- Motion easing
- Z-index
- Control height
- Artwork size

Components should use semantic tokens instead of copying raw values.

Artwork-derived themes should override a controlled subset of semantic accent tokens, not the complete design system.

## 34. Design Anti-Patterns

Avoid:

- Neon gaming aesthetics
- Rainbow gradients
- Constant glow
- Excessive glassmorphism
- Strong blur behind all surfaces
- Large animated background objects
- Decorative particle systems
- Strong bounce animations
- Continuous idle animation
- Dense dashboard layouts
- Overloaded toolbars
- Excessive icon-only controls
- Full-strength accent fills on large areas
- Excessive use of cards
- Bright borders around every element
- Effects that reduce artwork readability
- Effects that reduce lyric readability
- Motion unrelated to state or navigation
- Allowing visualizer work to interfere with audio stability
