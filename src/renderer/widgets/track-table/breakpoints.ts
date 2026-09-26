/**
 * The container widths below which track table columns yield to the title.
 * Header, cells, `<col>`, and the title artist fallback all read from here, so
 * changing one breakpoint changes them together.
 */
export const trackTableBreakpoints = {
  compact: {
    hide: "@max-[600px]/track-table:hidden",
    show: "@max-[600px]/track-table:block",
  },
  narrow: {
    hide: "@max-[760px]/track-table:hidden",
  },
} as const;

export type TrackTableBreakpoint = keyof typeof trackTableBreakpoints;

/** Estimated and actual row height; rows are set to this explicitly for virtualization. */
export const TRACK_ROW_HEIGHT = 44;
