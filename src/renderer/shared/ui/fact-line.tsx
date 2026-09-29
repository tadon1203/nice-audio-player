import { cn } from "@/renderer/shared/lib/utils";

/** A line of facts (year, track count, time). Items are separated by space, not middle dots. */
export function FactLine({
  facts,
  fallback,
  className,
}: {
  facts: readonly (string | number | null | undefined)[];
  /** Shown when no fact is available; the line is omitted without it. */
  fallback?: string;
  className?: string;
}) {
  const present = facts.filter((fact) => fact !== null && fact !== undefined && fact !== "");
  const items = present.length > 0 ? present : fallback ? [fallback] : [];
  if (items.length === 0) return null;

  return (
    <p
      className={cn("flex flex-wrap gap-x-4 text-sm tabular-nums text-muted-foreground", className)}
    >
      {items.map((item, index) => (
        <span key={index}>{item}</span>
      ))}
    </p>
  );
}
