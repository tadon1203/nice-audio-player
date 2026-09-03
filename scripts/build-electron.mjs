import { build } from 'esbuild';
await build({
	entryPoints: ['electron/main/index.ts'],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: 'dist-electron/main.cjs',
	external: ['electron']
});
await build({
	entryPoints: ['electron/preload/index.ts'],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: 'dist-electron/preload/index.cjs',
	external: ['electron']
});
