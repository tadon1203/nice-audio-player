import { useState } from "react";
import type { ArtworkRef } from "@/shared/ipc";
import { artworkUrl } from "@/renderer/shared/lib/artwork-url";
import { cn } from "@/renderer/shared/lib/utils";

type ArtworkProps = {
  artwork: ArtworkRef | null | undefined;
  alt?: string;
  loading?: "eager" | "lazy";
  className?: string;
};

function Artwork({ artwork, alt = "", loading = "lazy", className }: ArtworkProps) {
  const url = artworkUrl(artwork);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && failedUrl !== url;

  return (
    <span
      data-slot="artwork"
      className={cn(
        "block aspect-square [aspect-ratio:1/1] overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      {showImage ? (
        <img
          src={url}
          alt={alt}
          loading={loading}
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span aria-hidden="true" className="block h-full w-full bg-muted" />
      )}
    </span>
  );
}

export { Artwork };
