import { execa } from 'execa';
import { pathToFileURL } from 'node:url';

export const nativeWatchPaths = [
	'backend/src/**/*.rs',
	'backend/Cargo.toml',
	'backend/Cargo.lock',
	'backend/build.rs',
	'rust-toolchain.toml'
];

/** @param {{ release?: boolean, cancelSignal?: AbortSignal }} options */
export async function buildNative({ release = false, cancelSignal } = {}) {
	const args = [
		'build',
		'--manifest-path',
		'backend/Cargo.toml',
		'--target',
		'x86_64-pc-windows-msvc',
		'--platform',
		'--output-dir',
		'build/native',
		'--js',
		'index.cjs',
		'--dts',
		'native-backend.d.ts'
	];
	if (release) args.push('--release');
	args.push('--', '--locked');
	return execa('napi', args, {
		preferLocal: true,
		stdio: 'inherit',
		cancelSignal,
		killDescendants: true
	});
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
	const args = process.argv.slice(2);
	if (args.length > 1 || (args.length === 1 && args[0] !== '--release')) {
		console.error('Usage: node scripts/build-native.mjs [--release]');
		process.exit(2);
	}

	buildNative({ release: args[0] === '--release' }).catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
