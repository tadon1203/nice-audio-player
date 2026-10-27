import { goto } from "$app/navigation";
import { page } from "$app/state";
import { untrack } from "svelte";
import { motionTokens } from "#lib/components/ui/motion/tokens";
import { RetargetableSpring } from "#lib/components/ui/motion/retargetable-spring.svelte";

export interface LyricsSpan {
  startMs: number;
  endMs: number;
}

/** The spring counts as stopped within this share of the distance it travels. */
const PRECISION_OF_SPAN = 0.002;

/** Leaving is quicker than arriving. */
export const NOW_PLAYING_EXIT_SPEED = 0.7;

/**
 * What Now Playing's right column shows: the lyrics, the queue or the meters. Below 90rem the
 * switch chooses one of the three (the queue is always the rail from 90rem, beside lyrics or
 * meters). Remembered for the session: not reset on a track change, not persisted.
 */
export const rightColumn = $state<{ view: "lyrics" | "queue" | "meters" }>({ view: "lyrics" });

/**
 * The perceptual duration for opening and closing Now Playing: the one timeline the dock gives up
 * its waveform slot on, the surface lifts and the sleeve lands. Closing is the same spring run
 * about 30% faster.
 */
export function nowPlayingDuration(opening: boolean): number {
  const { duration } = motionTokens.large;
  return opening ? duration : duration * NOW_PLAYING_EXIT_SPEED;
}

/**
 * Now Playing: its open state and the motion that follows its opening. The open state is a layer
 * over the current location. It uses shallow-routing state. The location underneath does not change,
 * so the library stays mounted. Back closes the layer. A link followed from inside Now Playing closes
 * it. This class is the only reader and writer of `page.state`.
 */
export class NowPlaying {
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

  /**
   * A number that follows Now Playing opening (`whenOpen`) and closing (`whenClosed`) on its one
   * timeline, so the dock's pieces move together. Read its `current` value. It is a spring, so
   * reversing it mid-flight keeps its velocity. Under reduced motion (`reduced`) it jumps. Call
   * during component initialization.
   */
  public follow(whenClosed: number, whenOpen: number, reduced: () => boolean): RetargetableSpring {
    const spring = new RetargetableSpring(
      untrack(() => (this.isOpen ? whenOpen : whenClosed)),
      { precision: Math.abs(whenOpen - whenClosed) * PRECISION_OF_SPAN },
    );
    $effect(() => {
      const open = this.isOpen;
      const instant = reduced();
      untrack(() => {
        spring.duration = nowPlayingDuration(open);
        spring.set(open ? whenOpen : whenClosed, { instant });
      });
    });
    $effect(() => (): void => spring.stop());
    return spring;
  }

  #setState(state: App.PageState, replace: boolean): void {
    goto(page.url.href, { shallow: true, replace, state }).catch(() => undefined);
  }
}
