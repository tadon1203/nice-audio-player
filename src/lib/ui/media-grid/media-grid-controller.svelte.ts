import type { Attachment } from "svelte/attachments";
import { prefersReducedMotion } from "svelte/motion";
import type { RovingTarget } from "#lib/ui/artwork-glow/roving-target";
import { ScrollView } from "#lib/ui/scroll-view.svelte";
import { VirtualRows } from "#lib/ui/virtual-rows.svelte";
import { GridFlip } from "./grid-flip.svelte";
import { GridKeyboardNavigator } from "./grid-keyboard-navigator.svelte";
import { GridLayout, type GridMetrics } from "./grid-layout";
import type { ArtworkLookup } from "./roving-glow-tracker.svelte";
import { RovingGlowTracker } from "./roving-glow-tracker.svelte";
import { SortMotion, type SortMotionMode } from "./sort-motion.svelte";

/** Tile column width and row height, in rem (the template sizes the grid with them). */
export const TILE_WIDTH_REM = 12;
export const TILE_HEIGHT_REM = 15.5;
const COLUMN_GAP_REM = 1.25;
const ROW_GAP_REM = 2;
const OVERSCAN_ROWS = 3;

export interface MediaGridOptions<TItem> {
  items: readonly TItem[];
  itemKey: (item: TItem) => string;
  /**
   * The artwork of the item at `index`. With it, hovering or focusing a tile lets a faint
   * Artwork glow from that artwork fall behind the grid.
   */
  artworkAt?: ArtworkLookup;
  /** Changes when the sort does: tiles then slide (or fade) to their new places. */
  sortSignature: string;
  /** Told the index of the first tile in view, for the letter index label. */
  ontopindexchange?: (index: number) => void;
}

/** A mounted tile: its item, its place in the list, and its key. */
export interface MediaGridTile<TItem> {
  readonly item: TItem;
  readonly index: number;
  readonly key: string;
}

function readGridMetrics(): GridMetrics {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return {
    tileWidth: TILE_WIDTH_REM * rem,
    columnGap: COLUMN_GAP_REM * rem,
    tileHeight: TILE_HEIGHT_REM * rem,
    rowGap: ROW_GAP_REM * rem,
  };
}

/**
 * The virtual media grid: which tiles are mounted, where they sit, and the motion, glow and
 * keyboard behaviour around them. Construct it while a component initialises; the options are
 * read live.
 */
export class MediaGridController<TItem> {
  readonly #options: () => MediaGridOptions<TItem>;
  readonly #scrollView = ScrollView.current();
  readonly #metrics = readGridMetrics();
  readonly #rowHeight = this.#metrics.tileHeight + this.#metrics.rowGap;
  #wrap = $state<HTMLElement | null>(null);
  #list = $state<HTMLElement | null>(null);
  #width = $state(0);

  readonly #columns = $derived.by(() => GridLayout.columnCount(this.#width, this.#metrics));
  readonly #rowCount = $derived.by(() => Math.ceil(this.#options().items.length / this.#columns));
  readonly #first = $derived.by(() => (this.#virtual.items[0]?.index ?? 0) * this.#columns);
  readonly #last = $derived.by(() =>
    Math.min(
      this.#options().items.length,
      ((this.#virtual.items.at(-1)?.index ?? -1) + 1) * this.#columns,
    ),
  );
  readonly #topIndex = $derived.by(() => this.#virtual.topIndex * this.#columns);
  readonly #tiles = $derived.by((): MediaGridTile<TItem>[] => {
    const { items, itemKey } = this.#options();
    return items.slice(this.#first, this.#last).map((item, offset) => {
      return { item, index: this.#first + offset, key: itemKey(item) };
    });
  });
  // Under reduced motion a slide is a fade.
  readonly #motion = $derived.by(() =>
    this.#sort.current === "slide" && prefersReducedMotion.current ? "fade" : this.#sort.current,
  );

  readonly #virtual: VirtualRows;
  readonly #sort: SortMotion;
  readonly #glow: RovingGlowTracker;
  readonly #flip: GridFlip;
  readonly #keys: GridKeyboardNavigator;

  public constructor(options: () => MediaGridOptions<TItem>) {
    this.#options = options;
    this.#virtual = new VirtualRows({
      count: (): number => this.#rowCount,
      rowHeight: this.#rowHeight,
      overscan: OVERSCAN_ROWS,
    });
    this.#sort = new SortMotion(
      (): string => this.#options().sortSignature,
      (): HTMLElement | null => this.#scrollView.viewport,
    );
    this.#glow = new RovingGlowTracker({
      origin: (): HTMLElement | null => this.#wrap,
      artworkAt: (): ArtworkLookup | undefined => this.#options().artworkAt,
      watch: (): unknown => this.#tiles,
    });
    this.#flip = new GridFlip({
      signature: (): string => this.#options().sortSignature,
      list: (): HTMLElement | null => this.#list,
      motion: (): SortMotionMode => this.#motion,
      watch: (): unknown => this.#tiles,
      onSignatureChange: (): void => this.#glow.deactivate(),
    });
    this.#keys = new GridKeyboardNavigator({
      list: (): HTMLElement | null => this.#list,
      scrollElement: (): HTMLElement | null => this.#scrollView.viewport,
      columns: (): number => this.#columns,
      count: (): number => this.#options().items.length,
      range: (): { startIndex: number; endIndex: number } | null => this.#virtual.range,
      scrollMargin: (): number => this.#virtual.scrollMargin,
      metrics: this.#metrics,
      watch: (): unknown => this.#tiles,
    });

    $effect(() => {
      this.#options().ontopindexchange?.(this.#topIndex);
    });
  }

  /** The wrapper: it measures its width for the columns and is where the Artwork glow sits. */
  public readonly attach: Attachment<HTMLElement> = (node) => {
    this.#wrap = node;
    const stopBody = this.#virtual.attachBody(node);
    const measure = (): void => {
      this.#width = node.getBoundingClientRect().width;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return (): void => {
      observer.disconnect();
      stopBody?.();
      this.#wrap = null;
    };
  };

  /** The list of tiles: keys reach the grid's keyboard handling and its FLIP through it. */
  public readonly attachList: Attachment<HTMLElement> = (node) => {
    this.#list = node;
    return (): void => {
      this.#list = null;
    };
  };

  public get columns(): number {
    return this.#columns;
  }

  public get topSpacer(): number {
    return this.#virtual.topSpacer;
  }

  public get bottomSpacer(): number {
    return this.#virtual.bottomSpacer;
  }

  /** The tiles mounted now, in order. */
  public get tiles(): readonly MediaGridTile<TItem>[] {
    return this.#tiles;
  }

  /** The indexes of the items really in view (not the overscan rows), end exclusive. */
  public get visibleRange(): { readonly start: number; readonly end: number } {
    return { start: this.#first, end: this.#last };
  }

  /** Where the Artwork glow is, or `null` when it is not shown. */
  public get glowTarget(): RovingTarget | null {
    return this.#glow.target;
  }

  /** The transition of a tile that mounts. */
  public get fadeIn(): GridFlip["fadeIn"] {
    return this.#flip.fadeIn;
  }

  public readonly onKeydown = (event: KeyboardEvent): void => {
    this.#keys.onKeydown(event);
  };

  public readonly onPointerEnter = (index: number, tile: HTMLElement): void => {
    this.#glow.follow(index, tile);
  };

  public readonly onFocusIn = (index: number, tile: HTMLElement): void => {
    this.#keys.focused(index);
    this.#glow.follow(index, tile);
  };

  // Focus still in the grid, or the pointer still over it, keeps the Artwork glow on.
  public readonly onPointerLeave = (): void => {
    if (!this.#wrap?.matches(":focus-within")) this.#glow.deactivate();
  };

  public readonly onFocusOut = (event: FocusEvent): void => {
    const to = event.relatedTarget;
    if (to instanceof Node && this.#wrap?.contains(to)) return;
    if (!this.#wrap?.matches(":hover")) this.#glow.deactivate();
  };
}
