import { useEffect, useRef } from "react";
import {
  AnimatePresence,
  animate,
  m,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { cn } from "@/shared/lib/utils";
import { motionTokens } from "../motion/tokens";
import { useMotionTransition } from "../motion/use-motion-transition";
import {
  COLUMN_HOME_LAP,
  COLUMN_LAPS,
  resolveDirection,
  rollTarget,
  settleDelay,
  type RollDirection,
} from "./rolling-model";

/** Glyphs are drawn as CSS content, so the only text in the DOM is the real value (`sr-only`). */
const GLYPH = "before:content-[attr(data-glyph)]";
const ROWS = Array.from({ length: COLUMN_LAPS * 10 }, (_, i) => i % 10);
const HOME = COLUMN_HOME_LAP * 10;

type Direction = RollDirection | "auto";
type Settle = "together" | "right-last";

/** One digit place: a 0–9 column in a one-line window, moved with `transform` only. */
function DigitColumn({
  digit,
  direction,
  spin,
  delay,
  instant,
}: {
  digit: number;
  direction: RollDirection;
  spin: number;
  delay: number;
  instant: boolean;
}) {
  const roll = useMotionTransition(spin > 0 ? "spin" : "roll");
  const position = useMotionValue(HOME + digit);
  const shown = useRef(digit);
  const transform = useTransform(position, (v) => `translateY(${-v}lh)`);

  // Only a new digit starts a roll. The other props are read when it starts, so a re-render
  // with a different direction or spin cannot cut a running roll short.
  const latest = useRef({ direction, spin, delay, roll, instant });
  latest.current = { direction, spin, delay, roll, instant };
  const running = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (shown.current === digit) return;
    shown.current = digit;
    running.current?.stop();
    const { direction, spin, delay, roll, instant } = latest.current;
    if (instant) {
      position.jump(HOME + digit);
      return;
    }
    // Every lap looks the same, so re-centre (keeping any fraction) to always have room to roll.
    position.jump(HOME + (position.get() % 10));
    running.current = animate(position, rollTarget(position.get(), digit, direction, spin), {
      ...roll,
      delay,
      onComplete: () => position.jump(HOME + digit),
    });
  }, [digit, position]);
  useEffect(() => () => running.current?.stop(), []);

  return (
    <span className="inline-block h-[1lh] overflow-clip">
      <m.span className="flex flex-col will-change-transform" style={{ transform }}>
        {ROWS.map((row, i) => (
          <span key={i} data-glyph={row} className={GLYPH} />
        ))}
      </m.span>
    </span>
  );
}

/** Reduced motion: no rolling, the changed digit crossfades. */
function FadeDigit({ digit }: { digit: number }) {
  return (
    <span className="inline-block h-[1lh] overflow-clip">
      <m.span
        key={digit}
        data-glyph={digit}
        className={cn("block", GLYPH)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={motionTokens.feedback}
      ></m.span>
    </span>
  );
}

const isDigit = (c: string) => c >= "0" && c <= "9";

/**
 * Digits that roll like an odometer. Columns are keyed by their place from the right, so a
 * length change keeps the lower places in the same DOM and only adds or removes the ends.
 * Non-digits (`:` `,` `−`) are static and fade in and out with the width. The moving parts are
 * `aria-hidden`; the value itself is real text for assistive tech and tests.
 */
export function RollingNumber({
  value,
  direction = "auto",
  spin = 0,
  settle = "together",
  instant = false,
  className,
}: {
  value: string;
  direction?: Direction;
  /** Extra laps every changed digit turns (a seek, a count that jumps). */
  spin?: number;
  settle?: Settle;
  /** Digits change without rolling: for a value that ticks on its own, where only a jump
   * (a seek) is worth showing. */
  instant?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion() === true;
  const previous = useRef(value);
  const resolved: RollDirection =
    direction === "auto" ? resolveDirection(previous.current, value) : direction;
  useEffect(() => {
    previous.current = value;
  }, [value]);

  const chars = Array.from(value);
  return (
    <span className={cn("inline-flex", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex">
        <AnimatePresence initial={false} mode="popLayout">
          {chars.map((c, index) => {
            const place = chars.length - 1 - index;
            return (
              <m.span
                key={`${place}-${isDigit(c) ? "d" : "c"}`}
                className="inline-flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionTokens.feedback}
              >
                {!isDigit(c) ? (
                  <span data-glyph={c} className={cn("whitespace-pre", GLYPH)} />
                ) : reduced ? (
                  <FadeDigit digit={Number(c)} />
                ) : (
                  <DigitColumn
                    digit={Number(c)}
                    direction={resolved}
                    spin={spin}
                    delay={settleDelay(place, settle)}
                    instant={instant}
                  />
                )}
              </m.span>
            );
          })}
        </AnimatePresence>
      </span>
    </span>
  );
}
