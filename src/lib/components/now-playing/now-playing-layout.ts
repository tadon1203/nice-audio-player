/** The sizes of the Now Playing layer. */
export class NowPlayingLayout {
  /**
   * One Sleeve size for every state. Container units resolve against the grid area (the layer
   * without the waveform band): its height minus the outer padding (4rem), the gap between the
   * Sleeve and the info (1rem) and the info block (~10rem), and never more than 38% of the width.
   */
  public static readonly sleeveSize = "max(10rem, min(calc(100cqh - 15rem), 38cqw, 40rem))";

  /** The waveform band's height for the room the layer has: it gives way to the content. */
  public static waveformHeightFor(layerHeightPx: number): number {
    if (layerHeightPx >= 640) return 96;
    if (layerHeightPx >= 480) return 72;
    return 56;
  }
}
