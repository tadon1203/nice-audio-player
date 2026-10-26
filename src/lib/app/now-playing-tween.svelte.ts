import { untrack } from "svelte";
import { RetargetableSpring } from "#lib/ui/motion/retargetable-spring.svelte";
import { AppServices } from "./app-services.svelte";
import { NowPlayingMotion } from "./now-playing-motion";

/** The spring counts as stopped within this share of the distance it travels. */
const PRECISION_OF_SPAN = 0.002;

/**
 * A number that follows Now Playing opening (`whenOpen`) and closing (`whenClosed`) on its one
 * timeline, so the dock's pieces move together. It is a spring, so reversing it mid-flight keeps
 * its velocity. Under reduced motion it jumps. Construct during component initialization.
 */
export class NowPlayingTween {
  readonly #spring: RetargetableSpring;

  public constructor(whenClosed: number, whenOpen: number) {
    const { nowPlaying, motion: budget } = AppServices.current();
    this.#spring = new RetargetableSpring(
      untrack(() => (nowPlaying.isOpen ? whenOpen : whenClosed)),
      { precision: Math.abs(whenOpen - whenClosed) * PRECISION_OF_SPAN },
    );
    $effect(() => {
      const open = nowPlaying.isOpen;
      const reduced = budget.current === "reduced";
      untrack(() => {
        this.#spring.duration = NowPlayingMotion.duration(open);
        this.#spring.set(open ? whenOpen : whenClosed, { instant: reduced });
      });
    });
    $effect(() => (): void => this.#spring.stop());
  }

  /** The current value of the tween. */
  public get current(): number {
    return this.#spring.current;
  }
}
