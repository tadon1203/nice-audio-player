import { stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { net } from 'electron';
import { pathToFileURL } from 'node:url';

export function resolveRequestedPath(buildRoot: string, requestUrl: string): string {
	const pathname = decodeURIComponent(new URL(requestUrl).pathname);
	const requested = pathname.replace(/^[/\\]+/, '');
	return resolve(buildRoot, requested || '200.html');
}

export async function serveRendererRequest(
	buildRoot: string,
	requestUrl: string
): Promise<Response> {
	const requestedPath = resolveRequestedPath(buildRoot, requestUrl);
	const relativePath = relative(buildRoot, requestedPath);
	if (relativePath.startsWith('..') || isAbsolute(relativePath))
		return new Response('Forbidden', { status: 403 });
	try {
		if ((await stat(requestedPath)).isFile())
			return net.fetch(pathToFileURL(requestedPath).toString());
	} catch {
		// Missing routes are handled by the SvelteKit SPA fallback.
	}
	return net.fetch(pathToFileURL(join(buildRoot, '200.html')).toString());
}
