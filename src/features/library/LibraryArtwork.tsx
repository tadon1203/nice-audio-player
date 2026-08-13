import { useEffect, useState } from "react";
import type { ArtworkRef } from "@/bindings";
import { resolveArtworkUrl } from "@/lib/artwork-url";

export function LibraryArtwork({ artwork }: { artwork: ArtworkRef | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!artwork) {
      queueMicrotask(() => {
        if (active) setUrl(null);
      });
      return () => {
        active = false;
      };
    }
    void resolveArtworkUrl(artwork)
      .then((next) => {
        if (active) setUrl(next);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [artwork]);
  return url ? (
    <img className="library-view__artwork" src={url} alt="" />
  ) : (
    <span className="library-view__artwork library-view__artwork--placeholder" aria-hidden="true" />
  );
}
