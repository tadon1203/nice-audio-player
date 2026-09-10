import { exec } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ForgeConfig } from '@electron-forge/shared-types';

const execAsync = promisify(exec);

const config: ForgeConfig = {
	outDir: resolve('build', 'forge'),
	packagerConfig: {
		asar: true,
		extraResource: [resolve('build', 'backend')]
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
			await execAsync('pnpm build && pnpm stage:runtime', {
				cwd: process.cwd(),
				windowsHide: true
			});
		},
		packageAfterCopy: async (_config, buildPath) => {
			await rm(buildPath, { recursive: true, force: true });
			await mkdir(buildPath, { recursive: true });
			await cp(resolve('build', 'runtime'), buildPath, { recursive: true });
		}
	}
};

export default config;
