import type { Player } from "#lib/player/player.svelte";
import type { NoticeCenter } from "./notice-center.svelte";

/** Clears the upcoming queue and offers to undo it. */
export class ClearUpcoming {
  readonly #playback: Player;
  readonly #notices: NoticeCenter;

  public constructor(playback: Player, notices: NoticeCenter) {
    this.#playback = playback;
    this.#notices = notices;
  }

  public async run(): Promise<void> {
    if (await this.#playback.playerClearQueue()) this.#notices.offerUndo("Upcoming cleared");
  }
}
