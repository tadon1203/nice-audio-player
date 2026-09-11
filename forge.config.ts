import { exec } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { ForgeConfig } from '@electron-forge/shared-types';
import {
	backendOutput,
	forgeOutput,
	repositoryRoot,
	runtimeOutput
} from './scripts/build-paths.mjs';

const execAsync = promisify(exec);

const config: ForgeConfig = {
	outDir: forgeOutput,
	packagerConfig: {
		asar: true,
		extraResource: [backendOutput]
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
			await execAsync('pnpm run build', {
				cwd: repositoryRoot,
				windowsHide: true
			});
		},
		packageAfterCopy: async (_config, buildPath) => {
			await rm(buildPath, { recursive: true, force: true });
			await mkdir(buildPath, { recursive: true });
			await cp(runtimeOutput, buildPath, { recursive: true });
		}
	}
};

export default config;
