import { SupersededError } from "#lib/native";
import { ErrorMessages } from "./error-messages";
import type { NoticeCenter, NoticePlace } from "./notice-center.svelte";

/** Runs user actions and reports their failure in one place. */
export class UserActionRunner {
  readonly #notices: NoticeCenter;

  public constructor(notices: NoticeCenter) {
    this.#notices = notices;
  }

  /** Clears the error at `place`, runs `action`, and shows its failure at `place`. Ignores SupersededError. */
  public run(action: () => Promise<unknown>, place: NoticePlace = "dock"): void {
    this.#notices.clearError(place);
    void this.#settle(action, place);
  }

  async #settle(action: () => Promise<unknown>, place: NoticePlace): Promise<void> {
    try {
      await action();
    } catch (error) {
      // A request replaced by a newer one has nothing to report.
      if (error instanceof SupersededError) return;
      this.#notices.showError(place, ErrorMessages.of(error));
    }
  }
}
