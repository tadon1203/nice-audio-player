import { convertFileSrc } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

import type { ArtworkRef } from "@/bindings";
import { isArtworkRef } from "@/api/library";

type ArtworkUrlCacheEntry =
  { status: "pending"; promise: Promise<string> } | { status: "resolved"; value: string };

const artworkUrlCache = new Map<string, ArtworkUrlCacheEntry>();

export async function resolveArtworkUrl(artwork: ArtworkRef): Promise<string> {
  if (!isArtworkRef(artwork)) throw new Error("Invalid artwork reference.");
  const absolutePath = await join(await appLocalDataDir(), ...artwork.relativePath.split("/"));
  return convertFileSrc(absolutePath);
}

export function getCachedArtworkUrl(artwork: ArtworkRef | null): string | null {
  if (!artwork) return null;
  const entry = artworkUrlCache.get(artwork.contentHash);
  return entry?.status === "resolved" ? entry.value : null;
}

export function resolveArtworkUrlCached(artwork: ArtworkRef): Promise<string> {
  const key = artwork.contentHash;
  const cached = artworkUrlCache.get(key);
  if (cached) return cached.status === "resolved" ? Promise.resolve(cached.value) : cached.promise;
  const promise = resolveArtworkUrl(artwork).then(
    (value) => {
      artworkUrlCache.set(key, { status: "resolved", value });
      return value;
    },
    (error: unknown) => {
      if (artworkUrlCache.get(key)?.status === "pending") artworkUrlCache.delete(key);
      throw error;
    },
  );
  artworkUrlCache.set(key, { status: "pending", promise });
  return promise;
}
