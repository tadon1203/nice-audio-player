import { AnimatePresence, m, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { artworkUrl } from "@/renderer/shared/lib/artwork-url";
import { useArtworkBackdrop } from "@/renderer/shared/lib/artwork-backdrop";
import { cn } from "@/renderer/shared/lib/utils";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import type { ArtworkRef } from "@/shared/ipc";
import { breathingOpacity, breathingScale, LIGHT, type LightStrength } from "./light-model";

type ArtworkLightProps = {
  artwork: ArtworkRef | null | undefined;
  strength: LightStrength;
  /**
   * How a new image arrives: `fade` (the default), or wiped in from the right (`wipe-next`) or
   * left (`wipe-previous`) with the track direction, while the old one stays put until covered.
   */
  enter?: LightEnter;
  /**
   * Loudness 0-1 for a Light that breathes with the music. It only dims from its strength,
   * never brightens past it, and swells a few percent. Omit it for a still Light.
   */
  level?: MotionValue<number>;
  className?: string;
};

export type LightEnter = "fade" | "wipe-next" | "wipe-previous";

/** The incoming image's hidden state: its clip covers everything except an edge it grows from. */
const HIDDEN_CLIP = {
  "wipe-next": "inset(0 0 0 100%)",
  "wipe-previous": "inset(0 100% 0 0)",
} as const;

/**
 * The artwork as the app's light source: a static blurred image under a veil. Place it as
 * the first child of a `relative` surface; it never receives pointer events. It renders
 * nothing without artwork or when the `Artwork backdrop` preference is off, and is hidden
 * under `forced-colors` by CSS. Changing artwork crossfades (light is not an object).
 */
export function ArtworkLight({
  artwork,
  strength,
  enter = "fade",
  level,
  className,
}: ArtworkLightProps) {
  const enabled = useArtworkBackdrop((state) => state.enabled);
  const transition = useMotionTransition("light");
  const wipeTransition = useMotionTransition("mediumMove");
  const reduced = useReducedMotion() === true;
  const wipe = !reduced && enter !== "fade" ? enter : null;
  const url = artworkUrl(artwork);
  const breathe = useTransform(() =>
    level === undefined ? 1 : breathingOpacity(strength, level.get()) / LIGHT.strength[strength],
  );
  const swell = useTransform(() => (level === undefined ? 1 : breathingScale(level.get())));
  if (!enabled || url === null) return null;

  return (
    <div
      aria-hidden="true"
      data-slot="artwork-light"
      data-strength={strength}
      className={cn(
        "artwork-light pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <m.div className="absolute inset-0" style={{ opacity: breathe, scale: swell }}>
        <AnimatePresence initial={false}>
          <m.img
            key={url}
            src={url}
            alt=""
            initial={wipe ? { clipPath: HIDDEN_CLIP[wipe] } : { opacity: 0 }}
            animate={
              wipe
                ? { clipPath: "inset(0 0 0 0)", opacity: LIGHT.strength[strength] }
                : { opacity: LIGHT.strength[strength] }
            }
            // The old image only goes once the new one has covered it.
            exit={wipe ? { opacity: 0, transition: { duration: 0, delay: 0.3 } } : { opacity: 0 }}
            transition={wipe ? wipeTransition : transition}
            className="absolute inset-0 size-full scale-125 object-cover"
            style={{ filter: `blur(${LIGHT.blurPx}px) brightness(${LIGHT.brightness})` }}
          />
        </AnimatePresence>
      </m.div>
      <div className="absolute inset-0 bg-background" style={{ opacity: LIGHT.veilOpacity }} />
    </div>
  );
}
