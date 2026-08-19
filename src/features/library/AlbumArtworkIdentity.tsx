import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { spatialStructural } from "@/lib/motion";

export function AlbumArtworkIdentity({
  albumId,
  className,
  children,
}: {
  albumId: string;
  className: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <span className={className}>{children}</span>;
  return (
    <motion.span
      className={className}
      layoutId={`album-artwork:${albumId}`}
      transition={spatialStructural}
    >
      {children}
    </motion.span>
  );
}
