import { m } from "motion/react";
import type { ArtworkRef } from "@/shared/ipc";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "./artwork";

/** Corner radius of placed artwork (`rounded-lg`). Inline so a shared-element move keeps it. */
export const ARTWORK_RADIUS_PX = 6;

/**
 * Artwork that can move between screens as a shared element: a tile in the library and the
 * header of its details page render the same `layoutId`. The radius is set inline (not by
 * class) so the scale applied during the move does not stretch the corners.
 */
export function SharedArtwork({
  layoutId,
  artwork,
  alt,
  round = false,
  loading,
  className,
  imageClassName,
}: {
  layoutId: string;
  artwork: ArtworkRef | null | undefined;
  alt?: string;
  round?: boolean;
  loading?: "eager" | "lazy";
  className?: string;
  /** Applied to the image inside, e.g. a hover zoom that the frame clips. */
  imageClassName?: string;
}) {
  return (
    <m.div
      layoutId={layoutId}
      className={cn("aspect-square overflow-hidden", className)}
      style={{ borderRadius: round ? "50%" : ARTWORK_RADIUS_PX }}
    >
      <Artwork
        artwork={artwork}
        alt={alt}
        loading={loading}
        className={cn("size-full rounded-none", imageClassName)}
      />
    </m.div>
  );
}
