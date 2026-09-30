import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { m } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ArtworkRef } from "@/shared/ipc";
import { cn } from "@/renderer/shared/lib/utils";
import { RovingLight, type RovingTarget } from "./artwork-light/roving-light";
import { useMotionTransition } from "./motion";

type MediaGridProps = ComponentProps<"ul"> & {
  /**
   * The artwork of the item at `index` (its `MediaGridItem`'s `index`). With it, hovering or
   * focusing a tile lets a faint Light from that artwork fall behind the grid.
   */
  artworkAt?: (index: number) => ArtworkRef | null | undefined;
};

/** A left-filling grid of media tiles; each child is a `MediaGridItem` (or a plain list item). */
export function MediaGrid({ className, artworkAt, ...props }: MediaGridProps) {
  const { wrap, roving, target, leave } = useRovingLight(artworkAt);

  return (
    <div
      ref={wrap}
      className="relative [overflow-clip-margin:0.5rem] overflow-clip"
      onPointerLeave={leave}
      onBlur={leave}
    >
      {artworkAt !== undefined ? <RovingLight target={target} /> : null}
      <TileEventsContext value={roving}>
        <ul
          className={cn(
            "relative grid grid-cols-[repeat(auto-fill,12rem)] justify-start gap-x-5 gap-y-8",
            className,
          )}
          {...props}
        />
      </TileEventsContext>
    </div>
  );
}

/**
 * How a tile talks to its grid: it says when it is hovered or focused (the grid moves its Light
 * there and remembers where the focus is), and hands over its element so the grid can move
 * focus to a tile by index.
 */
type TileEvents = {
  follow?: (index: number, tile: HTMLElement) => void;
  focused?: (index: number) => void;
  register?: (index: number, tile: HTMLElement | null) => void;
};
const TileEventsContext = createContext<TileEvents | null>(null);

/**
 * The Light that follows the tile under the pointer or focus. Tiles report themselves (their
 * index and element), so nothing here reads the markup back out of the DOM.
 */
function useRovingLight(artworkAt: ((index: number) => ArtworkRef | null | undefined) | undefined) {
  const wrap = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<RovingTarget | null>(null);
  // Read through a ref so a new closure each render does not re-render every tile.
  const latest = useRef(artworkAt);
  useLayoutEffect(() => {
    latest.current = artworkAt;
  });
  const enabled = artworkAt !== undefined;
  const roving = useMemo<TileEvents | null>(
    () =>
      enabled
        ? {
            follow: (index, tile) => {
              const container = wrap.current;
              if (container === null) return;
              const box = tile.getBoundingClientRect();
              const origin = container.getBoundingClientRect();
              setTarget({
                artwork: latest.current?.(index) ?? null,
                x: box.left - origin.left + box.width / 2,
                y: box.top - origin.top + box.height / 2,
                active: true,
              });
            },
          }
        : null,
    [enabled],
  );
  const leave = () =>
    setTarget((current) => (current === null ? null : { ...current, active: false }));
  return { wrap, roving, target, leave };
}

/** How tiles change places for a moment after a sort: they slide, or (from far down) fade in. */
export type SortMotion = "slide" | "fade" | null;

/**
 * For a moment after `signature` (a sort key and direction) changes, says how a grid moves its
 * tiles: only for a sort, since typing in the filter changes the tiles too and must not animate.
 * A list that is scrolled down goes back to the top on a sort, so the tiles that were on screen
 * have nowhere to slide to: those fade in instead. `scrollElement` is where the grid scrolls.
 */
export function useSortMotion(signature: string, scrollElement: HTMLElement | null): SortMotion {
  const [seen, setSeen] = useState(signature);
  const [motion, setMotion] = useState<SortMotion>(null);
  if (seen !== signature) {
    setSeen(signature);
    setMotion(scrollElement !== null && scrollElement.scrollTop > 1 ? "fade" : "slide");
  }
  useEffect(() => {
    if (motion === null) return;
    const timer = setTimeout(() => setMotion(null), 800);
    return () => clearTimeout(timer);
  }, [motion, signature]);
  return motion;
}

/** For a grid that is not scrolled on its own: tiles slide after a sort. */
export function useSortFlip(signature: string): boolean {
  return useSortMotion(signature, null) === "slide";
}

/**
 * A grid item. `index` lets the grid find its artwork; `flip` slides it to its new place when
 * the order changes, and `fade` brings it in instead. (Grids that can be long are virtualized,
 * so what is mounted is near the view and worth animating.)
 */
export function MediaGridItem({
  index,
  flip = false,
  fade = false,
  children,
}: {
  index?: number;
  flip?: boolean;
  fade?: boolean;
  children: ReactNode;
}) {
  const transition = useMotionTransition("mediumMove");
  const tiles = use(TileEventsContext);
  const report = (event: { currentTarget: HTMLElement }) => {
    if (index === undefined) return;
    tiles?.follow?.(index, event.currentTarget);
    tiles?.focused?.(index);
  };
  const register = (element: HTMLLIElement | null) => {
    if (index !== undefined) tiles?.register?.(index, element);
  };
  return (
    <m.li
      ref={register}
      data-index={index}
      layout={flip ? "position" : false}
      initial={fade ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={transition}
      onPointerEnter={report}
      onFocus={report}
    >
      {children}
    </m.li>
  );
}

/** Tile column width, column gap and row height, in rem (see `VirtualMediaGrid`). */
const TILE_WIDTH_REM = 12;
const COLUMN_GAP_REM = 1.25;
const TILE_HEIGHT_REM = 15.5;
const ROW_GAP_REM = 2;
const OVERSCAN_ROWS = 3;

function rootFontPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * A media grid that mounts only the rows near the view, so a library of any size keeps the same
 * number of tiles in the DOM. Tiles have a fixed size (a square of artwork and two lines), which
 * makes a row's position plain arithmetic; the column count follows the container's width, as
 * `auto-fill` would. Items are mounted in one grid, so the sort slide and the roving Light work
 * as in `MediaGrid`.
 *
 * `scrollElement` is the region the grid scrolls in (`null` while it is still mounting).
 */
export function VirtualMediaGrid<Item>({
  items,
  scrollElement,
  initialOffset,
  itemKey,
  artworkAt,
  sortSignature,
  onTopIndexChange,
  renderItem,
}: {
  items: readonly Item[];
  scrollElement: HTMLElement | null;
  initialOffset?: number;
  itemKey: (item: Item) => string;
  artworkAt?: (index: number) => ArtworkRef | null | undefined;
  /** Changes when the sort does: tiles then slide (or fade) to their new places. */
  sortSignature: string;
  /** Told the index of the first tile in view, for the scroll index label. */
  onTopIndexChange?: (index: number) => void;
  renderItem: (item: Item, index: number) => ReactNode;
}) {
  const { wrap, roving, target, leave } = useRovingLight(artworkAt);
  const sortMotion = useSortMotion(sortSignature, scrollElement);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const rem = rootFontPx();

  useLayoutEffect(() => {
    const element = wrap.current;
    if (element === null) return;
    const measure = () => {
      setWidth(element.getBoundingClientRect().width);
      if (scrollElement !== null) {
        setScrollMargin(
          element.getBoundingClientRect().top -
            scrollElement.getBoundingClientRect().top +
            scrollElement.scrollTop,
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollElement]);

  const columnGap = COLUMN_GAP_REM * rem;
  const columns = Math.max(1, Math.floor((width + columnGap) / (TILE_WIDTH_REM * rem + columnGap)));
  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => (TILE_HEIGHT_REM + ROW_GAP_REM) * rem,
    overscan: OVERSCAN_ROWS,
    scrollMargin,
    initialOffset,
  });
  const rows = virtualizer.getVirtualItems();
  const firstRow = rows[0];
  const lastRow = rows.at(-1);
  const first = (firstRow?.index ?? 0) * columns;
  const last = Math.min(items.length, ((lastRow?.index ?? -1) + 1) * columns);
  const visible = items.slice(first, last);
  // The first row really in view (not the overscan rows above it) names the scroll index.
  const topIndex = (virtualizer.range?.startIndex ?? 0) * columns;
  useEffect(() => {
    onTopIndexChange?.(topIndex);
  }, [topIndex, onTopIndexChange]);

  // Arrow keys move focus between tiles. Tiles hand over their elements, so a tile that is not
  // mounted yet can be scrolled to and focused once it is.
  const tileElements = useRef(new Map<number, HTMLElement>());
  const focusedIndex = useRef<number | null>(null);
  const wanted = useRef<number | null>(null);
  const tileEvents = useMemo<TileEvents>(
    () => ({
      ...roving,
      focused: (index) => void (focusedIndex.current = index),
      register: (index, tile) => {
        if (tile === null) tileElements.current.delete(index);
        else tileElements.current.set(index, tile);
      },
    }),
    [roving],
  );
  const focusWanted = () => {
    const index = wanted.current;
    const tile = index === null ? undefined : tileElements.current.get(index);
    if (tile === undefined) return;
    wanted.current = null;
    // The scroll is already ours; the browser must not add its own.
    tile.querySelector<HTMLElement>("a[href], button")?.focus({ preventScroll: true });
  };
  useEffect(focusWanted);
  // Rows have one height, so where a tile is is arithmetic: no need to wait for it to mount.
  const scrollTileIntoView = (index: number) => {
    if (scrollElement === null) return;
    const rowTop =
      scrollMargin + Math.floor(index / columns) * (TILE_HEIGHT_REM + ROW_GAP_REM) * rem;
    const rowBottom = rowTop + TILE_HEIGHT_REM * rem;
    const view = scrollElement.clientHeight;
    if (rowTop < scrollElement.scrollTop) scrollElement.scrollTop = rowTop;
    else if (rowBottom > scrollElement.scrollTop + view) scrollElement.scrollTop = rowBottom - view;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const from = focusedIndex.current;
    if (from === null || event.ctrlKey || event.altKey || event.metaKey) return;
    const viewRows = Math.max(
      1,
      (virtualizer.range?.endIndex ?? 0) - (virtualizer.range?.startIndex ?? 0),
    );
    const target = {
      ArrowLeft: from - 1,
      ArrowRight: from + 1,
      ArrowUp: from - columns,
      ArrowDown: from + columns,
      PageUp: from - viewRows * columns,
      PageDown: from + viewRows * columns,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (target === undefined) return;
    // Focus is in the collection, so the arrows are the collection's (not the seek keys').
    event.preventDefault();
    const next = Math.min(items.length - 1, Math.max(0, target));
    wanted.current = next;
    scrollTileIntoView(next);
    focusWanted();
  };

  return (
    <div
      ref={wrap}
      // Rows are padding and mounted tiles; the browser must not "anchor" the scroll position to
      // a tile that is about to be replaced.
      className="relative [overflow-anchor:none] [overflow-clip-margin:0.5rem] overflow-clip"
      onPointerLeave={leave}
      onBlur={leave}
    >
      {artworkAt !== undefined ? <RovingLight target={target} /> : null}
      <TileEventsContext value={tileEvents}>
        <ul
          onKeyDown={onKeyDown}
          className="relative grid justify-start gap-x-5 gap-y-8"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${TILE_WIDTH_REM}rem)`,
            gridAutoRows: `${TILE_HEIGHT_REM}rem`,
            paddingTop: firstRow ? firstRow.start - scrollMargin : 0,
            paddingBottom: lastRow ? virtualizer.getTotalSize() - (lastRow.end - scrollMargin) : 0,
            boxSizing: "content-box",
          }}
        >
          {visible.map((item, offset) => (
            <MediaGridItem
              key={itemKey(item)}
              index={first + offset}
              flip={sortMotion === "slide"}
              fade={sortMotion === "fade"}
            >
              {renderItem(item, first + offset)}
            </MediaGridItem>
          ))}
        </ul>
      </TileEventsContext>
    </div>
  );
}
