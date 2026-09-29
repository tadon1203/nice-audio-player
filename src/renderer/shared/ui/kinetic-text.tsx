import { m } from "motion/react";
import { graphemes } from "@/renderer/shared/lib/graphemes";
import { useMotionTransition } from "./motion";

const STEP_S = 0.012;
const TOTAL_S = 0.24;
/** Words up to this long stay in one piece when the text wraps; longer runs (no spaces, as in Japanese) may break anywhere. */
const UNBREAKABLE_MAX = 16;

/**
 * Text whose characters slide in one after another, from the side the track came from
 * (`direction` 1 = from the right). The stagger is 12ms a character, capped at 240ms in total.
 * Shown only for track changes, never on first display. The moving spans are `aria-hidden`.
 */
export function KineticText({
  text,
  direction,
  className,
}: {
  text: string;
  direction: 1 | -1;
  className?: string;
}) {
  const transition = useMotionTransition("smallMove");
  const chars = graphemes(text);
  const step = Math.min(STEP_S, TOTAL_S / Math.max(1, chars.length));
  let index = 0;
  const words = text.split(/(\s+)/).filter((part) => part !== "");

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => {
          const parts = graphemes(word);
          const content = parts.map((char) => {
            const i = index++;
            return /^\s+$/.test(char) ? (
              <span
                key={i}
                data-glyph={char}
                className="whitespace-pre before:content-[attr(data-glyph)]"
              />
            ) : (
              <m.span
                key={i}
                data-glyph={char}
                className="inline-block before:content-[attr(data-glyph)]"
                initial={{ opacity: 0, x: 8 * direction }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...transition, delay: i * step }}
              />
            );
          });
          return parts.length <= UNBREAKABLE_MAX && !/^\s+$/.test(word) ? (
            <span key={w} className="inline-block whitespace-nowrap">
              {content}
            </span>
          ) : (
            <span key={w}>{content}</span>
          );
        })}
      </span>
    </span>
  );
}
