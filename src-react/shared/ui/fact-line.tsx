import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { RollingNumber } from "./rolling-number";

/** A fact that counts up from zero when the line first appears (after the shared-element move). */
export type CountUpFact = { text: string; countUp: true };
type Fact = string | number | null | undefined | CountUpFact;

/** The shared-element move (`largeMove`) takes about this long; counting starts after it. */
const COUNT_UP_DELAY_MS = 420;

/** A line of facts (year, track count, time). Items are separated by space, not middle dots. */
export function FactLine({
  facts,
  fallback,
  className,
}: {
  facts: readonly Fact[];
  /** Shown when no fact is available; the line is omitted without it. */
  fallback?: string;
  className?: string;
}) {
  const present = facts.filter(
    (fact): fact is string | number | CountUpFact =>
      fact !== null && fact !== undefined && fact !== "",
  );
  const items = present.length > 0 ? present : fallback ? [fallback] : [];
  if (items.length === 0) return null;

  return (
    <p
      className={cn("flex flex-wrap gap-x-4 text-sm tabular-nums text-muted-foreground", className)}
    >
      {items.map((item, index) =>
        typeof item === "object" ? (
          <CountUp key={index} text={item.text} />
        ) : (
          <span key={index}>{item}</span>
        ),
      )}
    </p>
  );
}

/** Starts as the same text with every digit zeroed, then rolls to the real value. */
function CountUp({ text }: { text: string }) {
  const [shown, setShown] = useState(() => text.replace(/[0-9]/g, "0"));
  useEffect(() => {
    const timer = setTimeout(() => setShown(text), COUNT_UP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return <RollingNumber value={shown} direction="up" settle="right-last" />;
}
