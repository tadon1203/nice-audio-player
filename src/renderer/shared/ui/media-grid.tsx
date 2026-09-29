import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { m, useInView } from "motion/react";
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
  const wrap = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<RovingTarget | null>(null);

  // One handler on the list (events bubble from the tiles) instead of one per tile.
  const follow = (event: { target: EventTarget }) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("li[data-index]");
    const container = wrap.current;
    if (item === null || container === null || artworkAt === undefined) return;
    const box = item.getBoundingClientRect();
    const origin = container.getBoundingClientRect();
    setTarget({
      artwork: artworkAt(Number(item.dataset.index)) ?? null,
      x: box.left - origin.left + box.width / 2,
      y: box.top - origin.top + box.height / 2,
      active: true,
    });
  };
  const leave = () =>
    setTarget((current) => (current === null ? null : { ...current, active: false }));

  return (
    <div
      ref={wrap}
      className="relative [overflow-clip-margin:0.5rem] overflow-clip"
      onPointerOver={follow}
      onFocus={follow}
      onPointerLeave={leave}
      onBlur={leave}
    >
      {artworkAt !== undefined ? <RovingLight target={target} /> : null}
      <ul
        className={cn(
          "relative grid grid-cols-[repeat(auto-fill,12rem)] justify-start gap-x-5 gap-y-8",
          className,
        )}
        {...props}
      />
    </div>
  );
}

/**
 * True for a moment after `signature` (a sort key and direction) changes, so a grid can slide
 * its tiles to their new places for a sort and only for a sort: typing in the filter changes
 * the tiles too, and must not animate.
 */
export function useSortFlip(signature: string): boolean {
  const [seen, setSeen] = useState(signature);
  const [flip, setFlip] = useState(false);
  if (seen !== signature) {
    setSeen(signature);
    setFlip(true);
  }
  useEffect(() => {
    if (!flip) return;
    const timer = setTimeout(() => setFlip(false), 800);
    return () => clearTimeout(timer);
  }, [flip, signature]);
  return flip;
}

/**
 * A grid item. `index` lets the grid find its artwork; `flip` slides it to its new place when
 * the order changes. Only items in view are measured, since off-screen tiles are not seen
 * moving and animating hundreds of them is wasted work.
 */
export function MediaGridItem({
  index,
  flip = false,
  children,
}: {
  index?: number;
  flip?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref);
  const transition = useMotionTransition("mediumMove");
  return (
    <m.li
      ref={ref}
      data-index={index}
      layout={flip && inView ? "position" : false}
      transition={transition}
    >
      {children}
    </m.li>
  );
}
