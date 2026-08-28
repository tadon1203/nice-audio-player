import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { spatialStructural } from "@/lib/motion";
import type { LibraryAlbumArtistKey } from "@/bindings";
import { albumArtistIdentity } from "./library-identity";

export function AlbumArtistArtworkIdentity({
  artistId,
  className,
  children,
}: {
  artistId: LibraryAlbumArtistKey;
  className: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <span className={className}>{children}</span>;
  return (
    <motion.span
      className={className}
      layoutId={`album-artist-artwork:${albumArtistIdentity(artistId)}`}
      transition={spatialStructural}
    >
      {children}
    </motion.span>
  );
}
