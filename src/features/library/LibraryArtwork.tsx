import { useEffect, useState } from "react";
import type { ArtworkRef } from "@/bindings";
import { resolveArtworkUrl } from "@/lib/artwork-url";

const artworkUrlCache = new WeakMap<object, Promise<string | null>>();

export function useLibraryArtworkUrl(artwork: ArtworkRef | null) {
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
    const pending = artworkUrlCache.get(artwork) ?? resolveArtworkUrl(artwork);
    artworkUrlCache.set(artwork, pending);
    void pending.then((next) => active && setUrl(next)).catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [artwork]);
  return url;
}

export function LibraryArtwork({
  artwork,
  className,
  resolvedUrl,
}: {
  artwork: ArtworkRef | null;
  className?: string;
  resolvedUrl?: string | null;
}) {
  const resolvedArtworkUrl = useLibraryArtworkUrl(artwork);
  const url = resolvedUrl === undefined ? resolvedArtworkUrl : resolvedUrl;
  return url ? (
    <img className={`library-view__artwork ${className ?? ""}`} src={url} alt="" />
  ) : (
    <span
      className={`library-view__artwork library-view__artwork--placeholder ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
