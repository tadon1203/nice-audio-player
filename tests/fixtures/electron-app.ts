import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { test as base, type Page } from '@playwright/test';

type ElectronFixtures = {
	electronApp: ElectronApplication;
	electronPage: Page;
};

const repositoryRoot = resolve(import.meta.dirname, '../..');

export const test = base.extend<ElectronFixtures>({
	electronApp: async ({ browserName }, use, testInfo) => {
		void browserName;
		const testDataDirectory = await mkdtemp(
			resolve(tmpdir(), `nice-audio-player-e2e-${testInfo.workerIndex}-`)
		);
		let electronApp: ElectronApplication | undefined;

		try {
			electronApp = await electron.launch({
				args: [repositoryRoot],
				env: {
					...process.env,
					NICE_AUDIO_PLAYER_E2E: '1',
					NICE_AUDIO_PLAYER_DEV_SERVER_URL: 'http://127.0.0.1:4200',
					NICE_AUDIO_PLAYER_TEST_DATA_DIR: testDataDirectory
				}
			});
			await use(electronApp);
		} finally {
			try {
				await electronApp?.close();
			} finally {
				await rm(testDataDirectory, { recursive: true, force: true });
			}
		}
	},
	electronPage: async ({ electronApp }, use) => {
		const page = await electronApp.firstWindow();
		await page.waitForLoadState('domcontentloaded');
		await use(page);
	}
});

export { expect } from '@playwright/test';
