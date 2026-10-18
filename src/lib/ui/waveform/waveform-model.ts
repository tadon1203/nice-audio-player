/** The calculations behind the seek bar: bar sizes, dB levels, scrubbing and key steps. */
export class Waveform {
  /** Pixels per bar (bar plus gap). Buckets are merged so the drawing never gets denser. */
  public static readonly BAR_PITCH_PX = 3;
  public static readonly SEEK_KEY_STEP_MS = 5_000;
  /** The quietest level the bars distinguish from silence, in dBFS. */
  public static readonly WAVEFORM_FLOOR_DB = -36;
  /** Vertical distance (px) from the bar within which a drag still moves the position 1:1. */
  public static readonly SCRUB_FREE_PX = 24;
  /** Each further this many px of distance halves the drag's speed. */
  public static readonly SCRUB_HALVING_PX = 48;
  /** The slowest a drag gets, however far the pointer is from the bar. */
  public static readonly SCRUB_MIN_GAIN = 1 / 32;
  /** Holding Shift while dragging moves at this fraction of the speed. */
  public static readonly SCRUB_SHIFT_GAIN = 0.1;

  /**
   * Reduces the backend's RMS buckets (0-255) to `count` bars. A span's level is the root of the
   * mean of its squares, never a max or a plain mean, so merging keeps the true average energy.
   */
  public static resampleBars(rms: readonly number[], count: number): number[] {
    if (rms.length === 0 || count <= 0) return [];
    const bars = Math.min(count, rms.length);
    return Array.from({ length: bars }, (_, bar) => {
      const start = Math.floor((bar * rms.length) / bars);
      const end = Math.max(start + 1, Math.floor(((bar + 1) * rms.length) / bars));
      let squares = 0;
      for (let index = start; index < end; index += 1) squares += (rms[index] ?? 0) ** 2;
      return Math.sqrt(squares / (end - start));
    });
  }

  /** Maps a 0-255 level to 0-1 on a dB scale from `WAVEFORM_FLOOR_DB` to full scale. */
  public static levelToUnit(level: number): number {
    if (level <= 0) return 0;
    const db = 20 * Math.log10(Math.min(255, level) / 255);
    return Math.max(0, 1 + db / -Waveform.WAVEFORM_FLOOR_DB);
  }

  /**
   * How much of the pointer's horizontal travel becomes playback travel while dragging. Right on
   * the bar it is 1 (the position follows the pointer); moving the pointer away from the bar
   * slows it, so a long track can be positioned finely by dragging low, and Shift slows it 10x.
   * This is the real resolution of the drag, not a picture of it.
   */
  public static scrubGain(distanceFromBarPx: number, fine: boolean): number {
    const beyond = Math.max(0, Math.abs(distanceFromBarPx) - Waveform.SCRUB_FREE_PX);
    const gain = Math.max(Waveform.SCRUB_MIN_GAIN, 0.5 ** (beyond / Waveform.SCRUB_HALVING_PX));
    return fine ? gain * Waveform.SCRUB_SHIFT_GAIN : gain;
  }

  /** The position after moving `dxPx` from an anchor, at the given gain, clamped to the track. */
  public static scrubPosition(
    anchorMs: number,
    dxPx: number,
    gain: number,
    widthPx: number,
    durationMs: number,
  ): number {
    if (widthPx <= 0 || durationMs <= 0) return 0;
    const moved = (dxPx / widthPx) * durationMs * gain;
    return Math.round(Math.min(durationMs, Math.max(0, anchorMs + moved)));
  }

  public static barCountForWidth(widthPx: number): number {
    return Math.max(1, Math.floor(widthPx / Waveform.BAR_PITCH_PX));
  }

  /** Maps a pointer's x offset inside the bar to a playback position. */
  public static positionFromOffset(offsetPx: number, widthPx: number, durationMs: number): number {
    if (widthPx <= 0 || durationMs <= 0) return 0;
    return Math.round(Math.min(1, Math.max(0, offsetPx / widthPx)) * durationMs);
  }

  public static nextSeekPosition(key: string, valueMs: number, durationMs: number): number | null {
    const clamp = (value: number): number => Math.min(durationMs, Math.max(0, value));
    switch (key) {
      case "ArrowLeft":
      case "ArrowDown":
        return clamp(valueMs - Waveform.SEEK_KEY_STEP_MS);
      case "ArrowRight":
      case "ArrowUp":
        return clamp(valueMs + Waveform.SEEK_KEY_STEP_MS);
      case "Home":
        return 0;
      case "End":
        return durationMs;
      default:
        return null;
    }
  }
}
