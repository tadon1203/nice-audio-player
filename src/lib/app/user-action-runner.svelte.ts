import type { Result } from "#lib/native/result";
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

  /**
   * Clears the error at `place`, runs `action`, and shows its failure at `place`. A Backend call
   * returns its failure as an error Result; an action that returns nothing has no failure to show.
   */
  public run(action: () => Promise<Result<unknown> | void>, place: NoticePlace = "dock"): void {
    this.#notices.clearError(place);
    this.#count(place, 1);
    // #settle catches every failure itself, so nothing reaches this handler.
    void this.#settle(action, place).catch(() => undefined);
  }

  async #settle(action: () => Promise<Result<unknown> | void>, place: NoticePlace): Promise<void> {
    try {
      const outcome = await action();
      if (outcome !== undefined && !outcome.ok) {
        this.#notices.showError(place, errorMessage(outcome.error));
      }
    } catch {
      // Not a Backend failure: a browser call such as the clipboard can still reject.
      this.#notices.showError(place, errorMessage({ code: "internal" }));
    } finally {
      this.#count(place, -1);
    }
  }

  #count(place: NoticePlace, delta: number): void {
    this.#running = { ...this.#running, [place]: (this.#running[place] ?? 0) + delta };
  }
}
