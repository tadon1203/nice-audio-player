import { expect, test } from '@playwright/test';
import { installNativeAppFixture } from './fixtures/native-app';

test.beforeEach(async ({ page }) => installNativeAppFixture(page));

test('connects folder registration, scan, catalog selection, and playback dock', async ({
	page
}) => {
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await expect(page.getByText('C:/Music')).toBeVisible();
	await page.getByRole('button', { name: 'Rescan' }).click();
	await expect(page.getByRole('status')).toContainText('1 inspected');

	await page.goto('/library');
	await page.getByRole('tab', { name: 'Tracks' }).click();
	await expect(page.getByRole('button', { name: /Test track/ })).toBeVisible();
	await page.getByRole('button', { name: /Test track/ }).click();
	await expect(page.getByTestId('playback-dock')).toContainText('Test track');
	await page.getByRole('button', { name: 'Pause' }).click();
	await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
	await page.getByRole('button', { name: 'Next track' }).click();
	await expect(page.getByTestId('playback-dock')).toContainText('Second track');
	await page.getByRole('button', { name: 'Previous track' }).click();
	await expect(page.getByTestId('playback-dock')).toContainText('Test track');

	const seek = page.getByRole('slider', { name: 'Playback position' });
	await seek.fill('60000');
	await seek.press('Enter');
	await expect(page.getByTestId('playback-dock')).toContainText('1:00');
	const volume = page.getByRole('slider', { name: 'Volume' });
	await volume.fill('0.42');
	await expect(volume).toHaveValue('0.42');
	await page.getByRole('button', { name: 'Mute' }).click();
	await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();

	const missing = page.getByRole('button', { name: 'Play Missing track' });
	await expect(missing).toBeDisabled();
	await expect(missing.getByText('Missing', { exact: true })).toBeVisible();
});

test('uses AlertDialog keyboard focus and cancel behavior', async ({ page }) => {
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('button', { name: 'Remove' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	const cancel = dialog.getByRole('button', { name: 'Cancel' });
	await expect(cancel).toBeFocused();
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

test('retains peer presentation filters and scroll context across Settings', async ({ page }) => {
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Library' }).click();

	const filter = page.getByRole('searchbox', { name: 'Filter library' });
	await filter.fill('Album');
	await page.waitForTimeout(200);
	const tracksTab = page.getByRole('tab', { name: 'Tracks' });
	await tracksTab.click();
	await expect(tracksTab).toHaveAttribute('aria-selected', 'true');
	await filter.fill('track');
	await page.waitForTimeout(200);
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('link', { name: 'Library' }).click();

	await expect(page.getByRole('tab', { name: 'Tracks' })).toHaveAttribute('aria-selected', 'true');
	await expect(filter).toHaveValue('track');
	await page.getByRole('tab', { name: 'Albums' }).click();
	await expect(filter).toHaveValue('Album');
});
