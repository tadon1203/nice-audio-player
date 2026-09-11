import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { electronOutput, repositoryRoot } from './build-paths.mjs';

await rm(electronOutput, { recursive: true, force: true });
await build({
	entryPoints: [resolve(repositoryRoot, 'electron/main/index.ts')],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: resolve(electronOutput, 'main.cjs'),
	external: ['electron']
});
await build({
	entryPoints: [resolve(repositoryRoot, 'electron/preload/index.ts')],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: resolve(electronOutput, 'preload/index.cjs'),
	external: ['electron']
});
