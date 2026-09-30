import { FlapText, RollingNumber } from "./rolling-number";

/**
 * The oversized, barely-there key of the list position (a letter, or a year that rolls like an
 * odometer) behind a scrolling grid. It shows while scrolling and for a moment after, then
 * fades. Decorative: `aria-hidden`, not shown in narrow containers (the parent must be a
 * `@container`) or under forced colors.
 */
export function ScrollIndex({ label, visible }: { label: string | null; visible: boolean }) {
  if (label === null) return null;
  return (
    <div
      aria-hidden="true"
      data-slot="scroll-index"
      className="pointer-events-none absolute top-1/4 right-10 hidden text-[10rem] leading-none text-foreground/5 transition-opacity duration-400 @min-[40rem]:block forced-colors:hidden"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/^\d+$/.test(label) ? (
        <RollingNumber value={label} className="tabular-nums" />
      ) : (
        <FlapText value={label} />
      )}
    </div>
  );
}
