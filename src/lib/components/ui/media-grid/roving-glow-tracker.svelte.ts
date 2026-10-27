import { type ArtworkRef } from "#lib/native/bindings";
import type { RovingTarget } from "#lib/components/ui/artwork-glow/roving-target";

/** The artwork of the item at an index. */
export type ArtworkLookup = (index: number) => ArtworkRef | null | undefined;

export interface RovingGlowTrackerOptions {
  /** The element the glow is positioned in (`null` while it is still mounting). */
  origin: () => HTMLElement | null;
  /** The grid's artwork lookup, if it has one. */
  artworkAt: () => ArtworkLookup | undefined;
  /** Read on each change of the tiles, so a tile that was unmounted drops the glow. */
  watch: () => unknown;
}

/**
 * The Artwork glow that follows the tile under the pointer or focus. Tiles report themselves
 * (their index and element), so nothing here reads the markup back out of the DOM. Construct it
 * while a component initialises.
 */
export class RovingGlowTracker {
  #target = $state<RovingTarget | null>(null);
  #targetTile: HTMLElement | null = null;
  readonly #options: RovingGlowTrackerOptions;

  public constructor(options: RovingGlowTrackerOptions) {
    this.#options = options;

    // A tile that is unmounted (filter, sort, scrolling away) no longer holds the Artwork glow.
    $effect(() => {
      options.watch();
      if (this.#targetTile !== null && !this.#targetTile.isConnected) this.deactivate();
    });
  }

  public get target(): RovingTarget | null {
    return this.#target;
  }

  public readonly follow = (index: number, tile: HTMLElement): void => {
    const origin = this.#options.origin();
    const artworkAt = this.#options.artworkAt();
    if (origin === null || artworkAt === undefined) return;
    this.#targetTile = tile;
    const box = tile.getBoundingClientRect();
    const originBox = origin.getBoundingClientRect();
    this.#target = {
      artwork: artworkAt(index) ?? null,
      x: box.left - originBox.left + box.width / 2,
      y: box.top - originBox.top + box.height / 2,
      active: true,
    };
  };

  public readonly deactivate = (): void => {
    if (this.#target !== null) this.#target = { ...this.#target, active: false };
    this.#targetTile = null;
  };
}
