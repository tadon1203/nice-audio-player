import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkFonts } from '../scripts/fonts.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { force: true, recursive: true });
});

describe('font asset checker', () => {
	it('accepts a non-empty WOFF2 asset at the canonical path', () => {
		const root = mkdtempSync(join(tmpdir(), 'nice-audio-player-fonts-'));
		temporaryDirectories.push(root);
		const directory = join(root, 'static', 'fonts', 'fontshare');
		mkdirSync(directory, { recursive: true });
		copyFileSync(
			join(process.cwd(), 'static', 'fonts', 'fontshare', 'Satoshi-Variable.woff2'),
			join(directory, 'Satoshi-Variable.woff2')
		);
		writeFileSync(join(directory, 'LICENSE.txt'), 'ITF Free Font License');

		expect(checkFonts(root)).toEqual([]);
	});

	it('reports a missing canonical asset', () => {
		const root = mkdtempSync(join(tmpdir(), 'nice-audio-player-fonts-'));
		temporaryDirectories.push(root);

		expect(checkFonts(root)).toEqual([
			'static/fonts/fontshare/Satoshi-Variable.woff2: missing or unreadable',
			'static/fonts/fontshare/LICENSE.txt: missing or unreadable'
		]);
	});
});
