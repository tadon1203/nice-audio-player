import { resolve } from 'node:path';

export const repositoryRoot = resolve(import.meta.dirname, '..');
const buildRoot = resolve(repositoryRoot, 'build');

export const buildPaths = Object.freeze({
	backend: resolve(buildRoot, 'backend'),
	electron: resolve(buildRoot, 'electron'),
	forge: resolve(buildRoot, 'forge'),
	renderer: resolve(buildRoot, 'renderer'),
	runtime: resolve(buildRoot, 'runtime')
});
