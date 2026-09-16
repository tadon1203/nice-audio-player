import { copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildNative } from './build-native.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const generatedPath = resolve(repositoryRoot, 'build/native/native-backend.d.ts');
const trackedPath = resolve(repositoryRoot, 'shared/native-backend.d.ts');

export async function updateBindings() {
	await buildNative();
	await copyFile(generatedPath, trackedPath);
}

export async function checkBindings() {
	await buildNative();
	const [generated, tracked] = await Promise.all([
		readFile(generatedPath, 'utf8'),
		readFile(trackedPath, 'utf8')
	]);
	if (generated !== tracked) {
		console.error('Native bindings are out of date. Run: pnpm bindings:update');
		return false;
	}
	return true;
}

/** @param {string | undefined} command */
async function main(command) {
	if (command === 'update') {
		await updateBindings();
		return 0;
	}
	if (command === 'check') return (await checkBindings()) ? 0 : 1;
	console.error('Usage: node scripts/bindings.mjs <update|check>');
	return 2;
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
	main(process.argv[2])
		.then((exitCode) => {
			process.exitCode = exitCode;
		})
		.catch((error) => {
			console.error(error);
			process.exitCode = 1;
		});
}
