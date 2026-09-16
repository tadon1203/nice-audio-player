import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';

/** @type {import('esbuild').BuildOptions} */
const electronBuildOptions = {
	entryPoints: {
		main: 'electron/main/index.ts',
		'preload/index': 'electron/preload/index.ts'
	},
	outdir: 'build/electron',
	outExtension: { '.js': '.cjs' },
	bundle: true,
	platform: 'node',
	format: 'cjs',
	external: ['electron'],
	tsconfig: 'tsconfig.json',
	logLevel: 'info'
};

export async function buildElectron() {
	return esbuild.build(electronBuildOptions);
}

/** @param {() => void | Promise<void>} onBuildSuccess */
export async function createElectronBuildContext(onBuildSuccess) {
	return esbuild.context({
		...electronBuildOptions,
		plugins: [
			{
				name: 'electron-build-success',
				setup(build) {
					build.onEnd((result) => {
						if (result.errors.length === 0) return onBuildSuccess();
					});
				}
			}
		]
	});
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
	if (process.argv.length !== 2) {
		console.error('Usage: node scripts/build-electron.mjs');
		process.exit(2);
	}
	buildElectron().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
