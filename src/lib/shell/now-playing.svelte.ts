import { pushState, replaceState } from "$app/navigation";
import { page } from "$app/state";

/**
 * Now Playing is a layer over the current location, kept in shallow-routing state. The location
 * underneath never changes, so the library stays mounted (scroll position included), and Back
 * closes the layer. Page state is not carried across navigation, so following a link from inside
 * Now Playing closes it.
 */
class NowPlaying {
  /** True while the open entry in history was pushed by `open`, so Back can undo it. */
  #pushed = false;

  get isOpen(): boolean {
    return page.state.nowPlaying === true;
  }

  open(): void {
    if (this.isOpen) return;
    this.#pushed = true;
    pushState("", { ...page.state, nowPlaying: true });
  }

  close(): void {
    if (!this.isOpen) return;
    if (this.#pushed) {
      this.#pushed = false;
      history.back();
    } else {
      // Reached by a reload or history jump: there is no entry of ours to go back to.
      replaceState("", { ...page.state, nowPlaying: false });
    }
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
}

export const nowPlaying = new NowPlaying();
