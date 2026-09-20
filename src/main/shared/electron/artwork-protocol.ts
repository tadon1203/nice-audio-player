import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

type ArtworkMimeType = "image/jpeg" | "image/png";
const ARTWORK_PATH = /^\/artwork\/([0-9a-f]{2})\/([0-9a-f]{64})\.(jpg|png)$/;

export function resolveArtworkRequest(
  dataRoot: string,
  requestUrl: string,
): { path: string; mimeType: ArtworkMimeType } | null {
  try {
    if (requestUrl.includes("\\")) return null;
    const url = new URL(requestUrl);
    if (url.protocol !== "nice-artwork:" || url.host !== "asset" || url.search || url.hash)
      return null;
    const pathname = decodeURIComponent(url.pathname);
    const match = ARTWORK_PATH.exec(pathname);
    if (!match || match[1] !== match[2].slice(0, 2)) return null;
    const root = resolve(dataRoot);
    const path = resolve(root, pathname.slice(1));
    const fromRoot = relative(root, path);
    if (
      isAbsolute(fromRoot) ||
      fromRoot === ".." ||
      fromRoot.startsWith(`..${sep}`) ||
      fromRoot.startsWith("../") ||
      fromRoot.startsWith("..\\")
    )
      return null;
    return { path, mimeType: match[3] === "jpg" ? "image/jpeg" : "image/png" };
  } catch {
    return null;
  }
}

export async function serveArtworkRequest(dataRoot: string, requestUrl: string): Promise<Response> {
  const resolved = resolveArtworkRequest(dataRoot, requestUrl);
  if (!resolved) return new Response("Forbidden", { status: 403 });
  try {
    const body = await readFile(resolved.path);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": resolved.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
