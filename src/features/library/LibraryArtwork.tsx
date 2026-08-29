import { useEffect, useState } from "react";
import type { ArtworkRef } from "@/bindings";
import { getCachedArtworkUrl, resolveArtworkUrlCached } from "@/lib/artwork-url";

export function useLibraryArtworkUrl(artwork: ArtworkRef | null) {
  const key = artwork?.contentHash ?? null;
  const [state, setState] = useState<{ key: string | null; url: string | null }>(() => ({
    key,
    url: getCachedArtworkUrl(artwork),
  }));
  useEffect(() => {
    let active = true;
    if (!artwork || !key) {
      return () => {
        active = false;
      };
    }
    const promise = resolveArtworkUrlCached(artwork);
    if (getCachedArtworkUrl(artwork) === null) {
      void promise
        .then((next) => {
          if (active) setState((current) => (current.key === key ? { key, url: next } : current));
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [artwork, key]);
  return key === state.key ? state.url : getCachedArtworkUrl(artwork);
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
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    queueMicrotask(() => setFailedUrl(null));
  }, [url]);
  const displayUrl = url && failedUrl !== url ? url : null;
  return (
    <span className="library-artwork-transition">
      {displayUrl ? (
        <img
          className={`library-view__artwork ${className ?? ""}`}
          src={displayUrl}
          onError={() => setFailedUrl(displayUrl)}
          alt=""
        />
      ) : (
        <span
          className={`library-view__artwork library-view__artwork--placeholder ${className ?? ""}`}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
