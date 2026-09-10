import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPaths, repositoryRoot } from './build-paths.mjs';

await rm(buildPaths.electron, { recursive: true, force: true });
await build({
	entryPoints: [resolve(repositoryRoot, 'electron/main/index.ts')],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: resolve(buildPaths.electron, 'main.cjs'),
	external: ['electron']
});
await build({
	entryPoints: [resolve(repositoryRoot, 'electron/preload/index.ts')],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: resolve(buildPaths.electron, 'preload/index.cjs'),
	external: ['electron']
});
