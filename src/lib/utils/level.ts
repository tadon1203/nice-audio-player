/** The quietest level the bars distinguish from silence, in dBFS. */
const WAVEFORM_FLOOR_DB = -36;

/** Maps a 0-255 level to 0-1 on a dB scale from `WAVEFORM_FLOOR_DB` to full scale. */
export function levelToUnit(level: number): number {
  if (level <= 0) return 0;
  const db = 20 * Math.log10(Math.min(255, level) / 255);
  return Math.max(0, 1 + db / -WAVEFORM_FLOOR_DB);
}
