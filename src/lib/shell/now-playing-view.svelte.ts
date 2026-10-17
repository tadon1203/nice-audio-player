import { goto } from "$app/navigation";
import { page } from "$app/state";

/**
 * Now Playing's open state: a layer over the current location, kept in shallow-routing state.
 * The location underneath never changes, so the library stays mounted (scroll position included),
 * and Back closes the layer. Page state is not carried across navigation, so following a link
 * from inside Now Playing closes it. It is restored after a reload (`persistState`). The only
 * reader and writer of `page.state`.
 */
export class NowPlayingView {
  /** True while the open entry in history was pushed by `open`, so Back can undo it. */
  #pushed = false;

  public get isOpen(): boolean {
    return page.state.nowPlaying === true;
  }

  public open(): void {
    if (this.isOpen) return;
    this.#pushed = true;
    void goto(page.url.href, { shallow: true, state: { nowPlaying: true }, persistState: true });
  }

  public close(): void {
    if (!this.isOpen) return;
    if (this.#pushed) {
      this.#pushed = false;
      history.back();
    } else {
      // Reached by a reload or history jump: there is no entry of ours to go back to.
      void goto(page.url.href, {
        shallow: true,
        replace: true,
        state: { nowPlaying: false },
        persistState: true,
      });
    }
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
}
