import { createHash } from 'node:crypto';
import {
	copyFileSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXPECTED_FONT_FILE = 'static/fonts/fontshare/Satoshi-Variable.woff2';
const FONT_ARCHIVE_URL = 'https://api.fontshare.com/v2/fonts/download/satoshi';
const EXPECTED_FONT_SHA256 = 'E739AFF9B4D02C264341D6D4872EDCDA28E79373AEDA936F659566A1CD3EB47F';
const LICENSE_PATH = 'static/fonts/fontshare/LICENSE.txt';

/** @param {string} repositoryRoot */
export function checkFonts(repositoryRoot) {
	const errors = [];
	for (const relativePath of [EXPECTED_FONT_FILE]) {
		try {
			const absolutePath = join(repositoryRoot, relativePath);
			const stats = statSync(absolutePath);
			if (!stats.isFile()) errors.push(`${relativePath}: expected a regular file`);
			else if (stats.size === 0) errors.push(`${relativePath}: file is empty`);
			else if (readFileSync(absolutePath).subarray(0, 4).toString('ascii') !== 'wOF2')
				errors.push(`${relativePath}: invalid WOFF2 signature`);
			else if (
				createHash('sha256').update(readFileSync(absolutePath)).digest('hex').toUpperCase() !==
				EXPECTED_FONT_SHA256
			)
				errors.push(`${relativePath}: SHA-256 does not match the approved Fontshare release`);
		} catch {
			errors.push(`${relativePath}: missing or unreadable`);
		}
	}
	try {
		const license = readFileSync(join(repositoryRoot, LICENSE_PATH), 'utf8');
		if (!license.includes('ITF Free Font License')) errors.push(`${LICENSE_PATH}: not the ITF FFL`);
	} catch {
		errors.push(`${LICENSE_PATH}: missing or unreadable`);
	}
	return errors;
}

/** @param {string} directory @param {string} fileName @returns {string | undefined} */
function findFile(directory, fileName) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const candidate = join(directory, entry.name);
		if (entry.isDirectory()) {
			const result = findFile(candidate, fileName);
			if (result) return result;
		} else if (entry.name === fileName) return candidate;
	}
	return undefined;
}

/** @param {string} repositoryRoot */
export async function download(repositoryRoot) {
	const destination = join(repositoryRoot, EXPECTED_FONT_FILE);
	const temporaryDirectory = join(tmpdir(), `nice-audio-player-font-${Date.now()}`);
	const archivePath = join(temporaryDirectory, 'satoshi.zip');
	try {
		mkdirSync(temporaryDirectory, { recursive: true });
		const response = await fetch(FONT_ARCHIVE_URL);
		if (!response.ok) throw new Error(`Fontshare returned HTTP ${response.status}`);
		writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
		const extraction = spawnSync('tar', ['-xf', archivePath, '-C', temporaryDirectory], {
			stdio: 'inherit'
		});
		if (extraction.status !== 0) throw new Error('tar could not extract the Fontshare archive');
		const source = findFile(temporaryDirectory, 'Satoshi-Variable.woff2');
		if (!source) throw new Error('Satoshi-Variable.woff2 was not found in the official archive');
		mkdirSync(join(repositoryRoot, 'static/fonts/fontshare'), { recursive: true });
		copyFileSync(source, destination);
		const errors = checkFonts(repositoryRoot);
		if (errors.length > 0) throw new Error(errors.join('; '));
		console.log(`fonts:download: installed and verified ${destination}`);
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
}

export function main(repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
	const errors = checkFonts(repositoryRoot);
	if (errors.length > 0) {
		for (const error of errors) console.error(`fonts:check: ${error}`);
		return 1;
	}
	console.log('fonts:check: required Fontshare assets are installed.');
	return 0;
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
	const command = process.argv[2];
	if (process.argv.length !== 3 || !command || !['check', 'download'].includes(command)) {
		console.error('Usage: node scripts/fonts.mjs <check|download>');
		process.exit(2);
	}
	if (command === 'download') {
		download(resolve(fileURLToPath(new URL('..', import.meta.url)))).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`fonts:download: ${message}`);
			process.exit(1);
		});
	} else process.exit(main());
}
