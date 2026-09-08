import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { net } from 'electron';
import { pathToFileURL } from 'node:url';

export function resolveRequestedPath(buildRoot: string, requestUrl: string): string {
	const pathname = decodeURIComponent(new URL(requestUrl).pathname);
	const requested = pathname.replace(/^[/\\]+/, '');
	return resolve(buildRoot, requested || 'index.html');
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
		return new Response('Not Found', { status: 404 });
	}
	return new Response('Not Found', { status: 404 });
}
