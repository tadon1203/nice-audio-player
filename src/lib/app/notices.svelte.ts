/**
 * Where an error shows: the Dock, the Playback section of the Settings screen, or the Library
 * section of the Settings screen.
 */
export type NoticePlace = "dock" | "settings" | "library";

export type Notice =
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "undo"; readonly message: string }
  | { readonly kind: "skipped"; readonly message: string };

/** How long the notice about skipped tracks, or the offer to undo, stays. */
const NOTICE_MS = 6_000;

type Timer = ReturnType<typeof setTimeout>;

/** Display state for failures and short messages. Domain stores hold none. */
export class Notices {
  #errors = $state.raw<Partial<Record<NoticePlace, string>>>({});
  #undo = $state.raw<string | null>(null);
  #skipped = $state.raw<string | null>(null);
  #skippedTitles: string[] = [];
  #skippedTimer: Timer | null = null;
  #undoTimer: Timer | null = null;

  /** What shows at `place`. In the Dock: an error, else an undo offer, else a skip notice. */
  public at(place: NoticePlace): Notice | null {
    const error = this.#errors[place];
    if (error !== undefined) return { kind: "error", message: error };
    if (place !== "dock") return null;
    if (this.#undo !== null) return { kind: "undo", message: this.#undo };
    if (this.#skipped !== null) return { kind: "skipped", message: this.#skipped };
    return null;
  }

  public showError(place: NoticePlace, message: string): void {
    this.#errors = { ...this.#errors, [place]: message };
  }

  /** Clears the error at `place`. */
  public dismissError(place: NoticePlace): void {
    if (this.#errors[place] === undefined) return;
    this.#errors = { ...this.#errors, [place]: undefined };
  }

  /** Consecutive skips share one notice. It clears after a time. */
  public noteSkipped(title: string | null): void {
    this.#skippedTitles.push(title ?? "a track");
    const [first, ...others] = this.#skippedTitles;
    this.#skipped =
      others.length === 0
        ? `Couldn't play ${first}, skipped`
        : `Couldn't play ${first} and ${others.length} more, skipped`;
    this.#skippedTimer = this.#restart(this.#skippedTimer, () => this.dismissSkipped());
  }

  /** An offer to undo a queue change. It clears after a time. */
  public offerUndo(message: string): void {
    this.#undo = message;
    this.#undoTimer = this.#restart(this.#undoTimer, () => this.dismissUndo());
  }

  public dismissUndo(): void {
    this.#undoTimer = this.#stop(this.#undoTimer);
    this.#undo = null;
  }

  public dismissSkipped(): void {
    this.#skippedTimer = this.#stop(this.#skippedTimer);
    this.#skippedTitles = [];
    this.#skipped = null;
  }

  /** Starts `dismiss` after the notice time. A timer that is still running is replaced. */
  #restart(timer: Timer | null, dismiss: () => void): Timer {
    if (timer !== null) clearTimeout(timer);
    return setTimeout(dismiss, NOTICE_MS);
  }

  #stop(timer: Timer | null): null {
    if (timer !== null) clearTimeout(timer);
    return null;
  }
}
