import { type TrackId } from "#lib/native/bindings";

export interface StripTrack {
  id: TrackId;
  durationMs: number | null;
}

/** The time state of a segment relative to the playing track. */
export type SegmentState = "past" | "current" | "future";

/** Calculations for the segments of an album strip. */
export class SegmentStrip {
  /** Past / current / future for each track; all `future` when the playing track is not in this album. */
  public static states(tracks: readonly StripTrack[], activeId: TrackId | null): SegmentState[] {
    const active = tracks.findIndex((t) => t.id === activeId);
    return tracks.map((_, i) =>
      active < 0 ? "future" : i < active ? "past" : i === active ? "current" : "future",
    );
  }

  /** Where each segment starts as a fraction (0-1) of the album's total length. */
  public static starts(tracks: readonly StripTrack[]): number[] {
    const total = tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
    if (total <= 0) return tracks.map(() => 0);
    let acc = 0;
    return tracks.map((t) => {
      const start = acc / total;
      acc += t.durationMs ?? 0;
      return start;
    });
  }

  /** How much of the playing segment is filled (0-1). */
  public static fill(positionMs: number, durationMs: number | null): number {
    if (durationMs === null || durationMs <= 0) return 0;
    return Math.min(1, Math.max(0, positionMs / durationMs));
  }
}
