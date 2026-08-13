import { convertFileSrc } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

import type { ArtworkRef } from "@/bindings";
import { isArtworkRef } from "@/api/library";

export async function resolveArtworkUrl(artwork: ArtworkRef): Promise<string> {
  if (!isArtworkRef(artwork)) throw new Error("Invalid artwork reference.");
  const absolutePath = await join(await appLocalDataDir(), ...artwork.relativePath.split("/"));
  return convertFileSrc(absolutePath);
}
