import type { ArtworkRef } from "#lib/native";
import { goto, pushState, replaceState } from "$app/navigation";
import { page } from "$app/state";

/** What the link that opened an album page tells it: the artwork to show while its details load. */
export type AlbumOrigin = {
  readonly artwork?: ArtworkRef | null;
};

/**
 * The shell's state that lives in the history: Now Playing is a layer over the current location,
 * kept in shallow-routing state. The location underneath never changes, so the library stays
 * mounted (scroll position included), and Back closes the layer. Page state is not carried across
 * navigation, so following a link from inside Now Playing closes it. The only reader and writer
 * of `page.state`.
 */
export class ShellHistory {
  /** True while the open entry in history was pushed by `openNowPlaying`, so Back can undo it. */
  #pushed = false;

  public get isNowPlayingOpen(): boolean {
    return page.state.nowPlaying === true;
  }

  /** The origin the current entry was opened with; empty when the entry is not an album's. */
  public get albumOrigin(): AlbumOrigin {
    return { artwork: page.state.artwork };
  }

  /** Opens an album page with its origin in the new entry. Where Back returns is in the URL. */
  public openAlbum(href: string, origin: AlbumOrigin): Promise<void> {
    return goto(href, { state: origin });
  }

  public openNowPlaying(): void {
    if (this.isNowPlayingOpen) return;
    this.#pushed = true;
    pushState("", { ...page.state, nowPlaying: true });
  }

  public closeNowPlaying(): void {
    if (!this.isNowPlayingOpen) return;
    if (this.#pushed) {
      this.#pushed = false;
      history.back();
    } else {
      // Reached by a reload or history jump: there is no entry of ours to go back to.
      replaceState("", { ...page.state, nowPlaying: false });
    }
  }

  public toggleNowPlaying(): void {
    if (this.isNowPlayingOpen) this.closeNowPlaying();
    else this.openNowPlaying();
  }
}
