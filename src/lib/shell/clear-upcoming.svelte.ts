import type { Playback } from "#lib/playback/playback.svelte";
import type { NoticeCenter } from "./notice-center.svelte";

/** Clears the upcoming queue and offers to undo it. */
export class ClearUpcoming {
  readonly #playback: Playback;
  readonly #notices: NoticeCenter;

  public constructor(playback: Playback, notices: NoticeCenter) {
    this.#playback = playback;
    this.#notices = notices;
  }

  public async run(): Promise<void> {
    if (await this.#playback.playerClearQueue()) this.#notices.offerUndo("Upcoming cleared");
  }
}
