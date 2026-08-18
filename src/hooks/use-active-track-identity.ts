import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtworkRef, LibraryTrackSummary, ValidatedAudioFile } from "@/bindings";
import { getLibraryTrackForPath } from "@/api/library";
import { resolveArtworkUrl } from "@/lib/artwork-url";

export interface ActiveTrackPresentation {
  id: string | null;
  title: string;
  artist: string | null;
  artwork: ArtworkRef | null;
  artworkUrl: string | null;
  artworkLoading: boolean;
  lookupPending: boolean;
}

interface ResolvedSummary {
  path: string;
  summary: LibraryTrackSummary | null;
}

interface ResolvedArtworkUrl {
  path: string;
  artworkPath: string;
  url: string | null;
}

function fallback(
  path: string | null,
  fileName: string | undefined,
  extension: string | undefined,
): ActiveTrackPresentation {
  if (!path || !fileName || !extension)
    return {
      title: "No audio selected",
      id: null,
      artist: null,
      artwork: null,
      artworkUrl: null,
      artworkLoading: false,
      lookupPending: false,
    };
  const suffix = `.${extension}`;
  const title = fileName.toLowerCase().endsWith(suffix.toLowerCase())
    ? fileName.slice(0, -suffix.length) || fileName
    : fileName;
  return {
    id: null,
    title,
    artist: null,
    artwork: null,
    artworkUrl: null,
    artworkLoading: false,
    lookupPending: Boolean(path),
  };
}

export function useActiveTrackIdentity(file: ValidatedAudioFile | null): ActiveTrackPresentation {
  const path = file?.path ?? null;
  const [resolvedSummary, setResolvedSummary] = useState<ResolvedSummary | null>(null);
  const [resolvedArtworkUrl, setResolvedArtworkUrl] = useState<ResolvedArtworkUrl | null>(null);
  const [artworkLoading, setArtworkLoading] = useState(false);
  const lookupRequest = useRef(0);
  const artworkRequest = useRef(0);
  const base = useMemo(
    () => fallback(path, file?.fileName, file?.extension),
    [path, file?.extension, file?.fileName],
  );
  const summary = resolvedSummary?.path === path ? resolvedSummary.summary : null;
  const identity = summary ?? base;
  const artwork = identity.artwork;
  const artworkPath = artwork?.relativePath ?? null;
  const artworkUrl =
    resolvedArtworkUrl?.path === path && resolvedArtworkUrl.artworkPath === artworkPath
      ? resolvedArtworkUrl.url
      : null;

  useEffect(() => {
    const token = ++lookupRequest.current;
    if (!path) {
      queueMicrotask(() => {
        if (token === lookupRequest.current) setResolvedSummary(null);
      });
      return;
    }
    void getLibraryTrackForPath(path)
      .then((result) => {
        if (token === lookupRequest.current) setResolvedSummary({ path, summary: result });
      })
      .catch(() => {
        if (token === lookupRequest.current) setResolvedSummary({ path, summary: null });
      });
  }, [path]);

  useEffect(() => {
    const token = ++artworkRequest.current;
    if (!path || !artwork || !artworkPath) {
      queueMicrotask(() => {
        if (token === artworkRequest.current) setArtworkLoading(false);
      });
      return;
    }
    queueMicrotask(() => {
      if (token === artworkRequest.current) setArtworkLoading(true);
    });
    void resolveArtworkUrl(artwork)
      .then((url) => {
        if (token === artworkRequest.current) setResolvedArtworkUrl({ path, artworkPath, url });
      })
      .catch(() => {
        if (token === artworkRequest.current)
          setResolvedArtworkUrl({ path, artworkPath, url: null });
      })
      .finally(() => {
        if (token === artworkRequest.current) setArtworkLoading(false);
      });
  }, [artwork, artworkPath, path]);

  return {
    id: summary?.id ?? null,
    title: identity.title,
    artist: identity.artist,
    artwork,
    artworkUrl,
    artworkLoading: artworkLoading && Boolean(path && artworkPath),
    lookupPending: Boolean(path && resolvedSummary?.path !== path),
  };
}
