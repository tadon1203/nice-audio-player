import { errorMessage } from "#lib/native/messages";
import type { NoticeCenter, NoticePlace } from "./notice-center.svelte";

/** Runs user actions, reports their failure in one place, and tells which places are busy. */
export class UserActionRunner {
  readonly #notices: NoticeCenter;
  #running = $state.raw<Partial<Record<NoticePlace, number>>>({});

  public constructor(notices: NoticeCenter) {
    this.#notices = notices;
  }

  /** True while an action run for `place` has not settled. Disable the controls that start it. */
  public isRunning(place: NoticePlace): boolean {
    return (this.#running[place] ?? 0) > 0;
  }

  /** Clears the error at `place`, runs `action`, and shows its failure at `place`. */
  public run(action: () => Promise<unknown>, place: NoticePlace = "dock"): void {
    this.#notices.clearError(place);
    this.#count(place, 1);
    // #settle catches every failure itself, so nothing reaches this handler.
    void this.#settle(action, place).catch(() => undefined);
  }

  async #settle(action: () => Promise<unknown>, place: NoticePlace): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.#notices.showError(place, errorMessage(error));
    } finally {
      this.#count(place, -1);
    }
  }

  #count(place: NoticePlace, delta: number): void {
    this.#running = { ...this.#running, [place]: (this.#running[place] ?? 0) + delta };
  }
}
