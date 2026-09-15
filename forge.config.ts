import { relative, resolve } from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';

const repositoryRoot = import.meta.dirname;
const runtimeRoots = ['build/electron', 'build/native', 'build/renderer'] as const;

function keepRuntimePath(absolutePath: string): boolean {
	const path = relative(repositoryRoot, absolutePath).replaceAll('\\', '/');

	if (path === '') return true;
	if (path === 'package.json') return true;
	if (path === 'build') return true;

	return runtimeRoots.some((root) => path === root || path.startsWith(`${root}/`));
}

const config: ForgeConfig = {
	outDir: resolve(repositoryRoot, 'build/forge'),

	packagerConfig: {
		asar: {
			unpack: '**/*.node'
		},

		ignore: (absolutePath) => !keepRuntimePath(absolutePath)
	},

	makers: [
		{
			name: '@electron-forge/maker-squirrel',
			platforms: ['win32'],
			config: {
				authors: 'Nice Audio Player contributors',
				name: 'nice_audio_player'
			}
		}
	]
};

export default config;
