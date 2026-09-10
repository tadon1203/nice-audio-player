import { exec } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { buildPaths, repositoryRoot } from './scripts/build-paths.mjs';

const execAsync = promisify(exec);

const config: ForgeConfig = {
	outDir: buildPaths.forge,
	packagerConfig: {
		asar: true,
		extraResource: [buildPaths.backend]
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
	],
		hooks: {
		prePackage: async () => {
			await execAsync('pnpm build', {
				cwd: repositoryRoot,
				windowsHide: true
			});
		},
		packageAfterCopy: async (_config, buildPath) => {
			await rm(buildPath, { recursive: true, force: true });
			await mkdir(buildPath, { recursive: true });
			await cp(buildPaths.runtime, buildPath, { recursive: true });
		}
	}
};

export default config;
