import { expect, test } from '../fixtures/electron-app';

test('starts the desktop runtime through Preload and the native backend', async ({
	electronPage
}) => {
	expect(electronPage.url()).toMatch(/^nice-player:\/\/renderer\//);
	await expect(electronPage.getByRole('heading', { level: 1, name: 'Albums' })).toBeVisible();
	await expect
		.poll(() =>
			electronPage.evaluate(() => {
				if (!window.nativeApp) throw new Error('Preload API is unavailable');
				return window.nativeApp.getPlaybackState();
			})
		)
		.toMatchObject({ status: 'stopped' });
	await expect
		.poll(() =>
			electronPage.evaluate(() => {
				if (!window.nativeApp) throw new Error('Preload API is unavailable');
				return window.nativeApp.getLibraryStatus();
			})
		)
		.toMatchObject({ status: 'ready' });
	expect(await electronPage.evaluate(() => typeof window.require)).toBe('undefined');
});
