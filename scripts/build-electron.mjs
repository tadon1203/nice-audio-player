import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('build/electron', { recursive: true, force: true });
await build({
	entryPoints: ['electron/main/index.ts'],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: 'build/electron/main.cjs',
	external: ['electron']
});
await build({
	entryPoints: ['electron/preload/index.ts'],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: 'build/electron/preload/index.cjs',
	external: ['electron']
});
