import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { net } from "electron";
import { pathToFileURL } from "node:url";

export function resolveRequestedPath(buildRoot: string, requestUrl: string): string {
  const pathname = decodeURIComponent(new URL(requestUrl).pathname);
  return resolve(buildRoot, pathname.replace(/^[/\\]+/, "") || "index.html");
}

export async function serveRendererRequest(
  buildRoot: string,
  requestUrl: string,
): Promise<Response> {
  const root = resolve(buildRoot);
  const requested = resolveRequestedPath(root, requestUrl);
  const fromRoot = relative(root, requested);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${requirePathSeparator()}`) ||
    fromRoot.startsWith("../") ||
    fromRoot.startsWith("..\\") ||
    isAbsolute(fromRoot)
  )
    return new Response("Forbidden", { status: 403 });
  try {
    if ((await stat(requested)).isFile()) return net.fetch(pathToFileURL(requested).toString());
  } catch {
    return new Response("Not Found", { status: 404 });
  }
  return new Response("Not Found", { status: 404 });
}

function requirePathSeparator(): string {
  return "\\";
}
