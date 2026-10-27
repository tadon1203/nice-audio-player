import type { Player } from "#lib/player/player.svelte";
import type { Result } from "#lib/native/result";
import type { Notices } from "./user-actions.svelte";

/** Clears the upcoming queue and offers to undo it. */
export class ClearUpcoming {
  readonly #playback: Player;
  readonly #notices: Notices;

  public constructor(playback: Player, notices: Notices) {
    this.#playback = playback;
    this.#notices = notices;
  }

  public async run(): Promise<Result<boolean>> {
    const outcome = await this.#playback.playerClearQueue();
    if (outcome.ok && outcome.value) this.#notices.offerUndo("Upcoming cleared");
    return outcome;
  }
}
