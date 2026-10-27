import { goto } from "$app/navigation";
import { page } from "$app/state";

export interface LyricsSpan {
  startMs: number;
  endMs: number;
}

/**
 * Now Playing: its open state and the link between its lyrics and the dock's waveform. Each field
 * is its own signal: the pointer moves often, and a reader that only wants `lyricsActiveSpan` must
 * not rerun with it.
 *
 * The open state is a layer over the current location. It uses shallow-routing state. The location
 * underneath does not change, so the library stays mounted. Back closes the layer. A link followed
 * from inside Now Playing closes it. This class is the only reader and writer of `page.state`.
 */
export class NowPlaying {
  /** The current lyric line's span, lit on the dock waveform. */
  public lyricsActiveSpan = $state.raw<LyricsSpan | null>(null);
  /** The span of the lyric line under the pointer, faintly marked on the waveform. */
  public lyricsHoveredLineSpan = $state.raw<LyricsSpan | null>(null);
  /** The position under the pointer while hovering the waveform, marking its lyric line. */
  public waveformHoveredMs = $state.raw<number | null>(null);

  public get isOpen(): boolean {
    return page.state.nowPlaying === true;
  }

  public open(): void {
    if (this.isOpen) return;
    this.#setState({ nowPlaying: true }, false);
  }

  public close(): void {
    if (!this.isOpen) return;
    // With no entry to go back to (a reload or a direct link), replace the open entry instead.
    if (history.length > 1) history.back();
    else this.#setState({ nowPlaying: false }, true);
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  #setState(state: App.PageState, replace: boolean): void {
    goto(page.url.href, { shallow: true, replace, state }).catch(() => undefined);
  }
}
