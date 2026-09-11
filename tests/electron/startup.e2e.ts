import { expect, test } from '../fixtures/electron-app';

test('starts the desktop runtime through Preload and the backend', async ({ electronPage }) => {
	await expect(electronPage.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
	await expect
		.poll(() =>
			electronPage.evaluate(() => {
				if (!window.app) throw new Error('Preload API is unavailable');
				return window.app.ping();
			})
		)
		.toBe('pong');
	expect(await electronPage.evaluate(() => typeof window.require)).toBe('undefined');
});
