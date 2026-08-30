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
  resolvedUrl,
}: {
  artwork: ArtworkRef | null;
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
    <span data-slot="library-artwork" className="grid aspect-square w-full">
      {displayUrl ? (
        <img
          className="col-start-1 row-start-1 block aspect-square w-full rounded-[inherit] object-cover"
          src={displayUrl}
          onError={() => setFailedUrl(displayUrl)}
          alt=""
        />
      ) : (
        <span
          className="col-start-1 row-start-1 block aspect-square w-full rounded-[inherit] border border-border-subtle bg-surface-raised"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
