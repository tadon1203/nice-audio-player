import { onMount, tick } from "svelte";
import { AppServices } from "#lib/app/app-services.svelte";
import { RollingMath } from "#lib/ui/rolling-number/rolling-math";

/**
 * The spin of the time digits after a seek. A completed seek spins the digits with its distance;
 * ordinary ticks, a new track and dragging (`dragging`, the digits follow the pointer) do not.
 * Construct during component initialization; read `turns` where it is shown.
 */
export class SeekSpin {
  readonly #playback = AppServices.current().player;
  readonly #dragging: () => boolean;
  #turns = $state(0);

  public constructor(dragging: () => boolean) {
    this.#dragging = dragging;
    onMount(() =>
      this.#playback.clock.onJump((jump) => {
        if (jump.kind !== "seek" || this.#dragging()) return;
        this.#turns = RollingMath.spinTurns(jump.toMs - jump.fromMs);
        void tick()
          .then(() => (this.#turns = 0))
          .catch(() => undefined);
      }),
    );
  }

  public get turns(): number {
    return this.#turns;
  }
}
