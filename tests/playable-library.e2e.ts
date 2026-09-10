import { expect, test } from '@playwright/test';
import { installNativeAppFixture } from './fixtures/native-app';

test.beforeEach(async ({ page }) => installNativeAppFixture(page));

test('connects folder registration, scan, catalog selection, and playback dock', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Add folder' }).click();
	await expect(page.getByText('C:/Music')).toBeVisible();
	await page.getByRole('button', { name: 'Rescan' }).click();
	await expect(page.getByRole('status')).toContainText('1 inspected');

	await page.goto('/library');
	await page.getByRole('tab', { name: 'Tracks' }).click();
	await expect(page.getByRole('button', { name: /Test track/ })).toBeVisible();
	await page.getByRole('button', { name: /Test track/ }).click();
	await page.evaluate(() =>
		(window as Window & { __emitPlayback?: () => void }).__emitPlayback?.()
	);
	await expect(page.getByTestId('playback-dock')).toContainText('track.wav');
});

test('uses AlertDialog keyboard focus and cancel behavior', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('button', { name: 'Remove' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	const cancel = dialog.getByRole('button', { name: 'Cancel' });
	await expect(cancel).toHaveAttribute('autofocus', '');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('empty library remains interactive across tabs and routes', async ({ page }) => {
	const errors: Error[] = [];
	page.on('pageerror', (error) => errors.push(error));

	await page.goto('/library');
	const albums = page.getByRole('tab', { name: 'Albums' });
	await albums.click();
	await expect(albums).toHaveAttribute('aria-selected', 'true');
	await expect
		.poll(() => albums.evaluate((element) => getComputedStyle(element, '::after').opacity))
		.toBe('1');

	const artists = page.getByRole('tab', { name: 'Album Artists' });
	await artists.click();
	await expect(artists).toHaveAttribute('aria-selected', 'true');

	const tracks = page.getByRole('tab', { name: 'Tracks' });
	await tracks.click();
	await expect(tracks).toHaveAttribute('aria-selected', 'true');
	await tracks.focus();
	await page.keyboard.press('ArrowLeft');
	await expect(artists).toBeFocused();
	await expect(artists).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('link', { name: 'Settings' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.locator('[data-page="settings"]')).toBeVisible();
	await page.getByRole('link', { name: 'Library' }).click();
	await expect(page).toHaveURL(/\/library$/);
	await expect(page.locator('[data-page="library"]')).toBeVisible();

	expect(errors).toEqual([]);
});
