/**
 * The dock's vertical rhythm, in px, in one place: the dock box, the waveform slot inside it and
 * the transport row are all derived from these.
 */
/** The transport row (identity, transport, volume). */
export const ROW_PX = 64;
/** The gap under the row, and the gap above it while Now Playing is open. */
export const EDGE_PX = 12;
/** The dock's progress band: one line of 14px text. */
export const BAND_PX = 14;
/** The gap between the band and the row. */
export const BAND_GAP_PX = 10;
/** Room above the band, so it does not sit on the dock's top edge. */
export const TOP_PX = 4;

/** What the waveform slot takes up while the dock shows it: the band and its gap. */
export const SLOT_PX = BAND_PX + BAND_GAP_PX;
/** The dock box while Now Playing is open (the waveform lives up there): row between two gaps. */
export const DOCK_HEIGHT_NOW_PLAYING_PX = ROW_PX + 2 * EDGE_PX;
/** The dock box with its waveform slot. */
export const DOCK_HEIGHT_PX = TOP_PX + SLOT_PX + ROW_PX + EDGE_PX;
