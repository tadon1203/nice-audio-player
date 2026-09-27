import { AnimatePresence, m } from "motion/react";
import { artworkUrl } from "@/renderer/shared/lib/artwork-url";
import { useArtworkBackdrop } from "@/renderer/shared/lib/artwork-backdrop";
import { cn } from "@/renderer/shared/lib/utils";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import type { ArtworkRef } from "@/shared/ipc";
import { LIGHT, type LightStrength } from "./light-model";

type ArtworkLightProps = {
  artwork: ArtworkRef | null | undefined;
  strength: LightStrength;
  className?: string;
};

/**
 * The artwork as the app's light source: a static blurred image under a veil. Place it as
 * the first child of a `relative` surface; it never receives pointer events. It renders
 * nothing without artwork or when the `Artwork backdrop` preference is off, and is hidden
 * under `forced-colors` by CSS. Changing artwork crossfades (light is not an object).
 */
export function ArtworkLight({ artwork, strength, className }: ArtworkLightProps) {
  const enabled = useArtworkBackdrop((state) => state.enabled);
  const transition = useMotionTransition("light");
  const url = artworkUrl(artwork);
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
      <AnimatePresence initial={false}>
        <m.img
          key={url}
          src={url}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: LIGHT.strength[strength] }}
          exit={{ opacity: 0 }}
          transition={transition}
          className="absolute inset-0 size-full scale-125 object-cover"
          style={{ filter: `blur(${LIGHT.blurPx}px) brightness(${LIGHT.brightness})` }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-background" style={{ opacity: LIGHT.veilOpacity }} />
    </div>
  );
}
