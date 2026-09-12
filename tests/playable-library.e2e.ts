import { expect, test } from '@playwright/test';
import { installNativeAppFixture } from './fixtures/native-app';

test.beforeEach(async ({ page }) => installNativeAppFixture(page));

test('connects folder registration, scan, catalog selection, and playback dock', async ({
	page
}) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await expect(page.getByText('C:/Music')).toBeVisible();
	await page.getByRole('button', { name: 'Rescan' }).click();
	await expect(page.getByRole('status')).toContainText('1 inspected');

	await page.getByRole('link', { name: 'Tracks' }).click();
	await expect(
		page.getByTestId('playback-status-bar').locator('[data-status-line="SOURCE"]')
	).toContainText('—');
	await expect(page.getByRole('button', { name: /Test track/ })).toBeVisible();
	const stoppedSeek = page.getByRole('slider', { name: 'Playback position' });
	await expect(stoppedSeek).toHaveCount(1);
	await expect(stoppedSeek).toBeDisabled();
	await page.getByRole('button', { name: /Test track/ }).click();
	await expect(page.getByTestId('playback-dock')).toContainText('Test track');
	await expect(
		page.getByTestId('playback-status-bar').locator('[data-status-line="SOURCE"]')
	).toContainText('WAV');
	await expect(
		page.getByTestId('playback-status-bar').locator('[data-status-line="SRC"]')
	).toContainText('44.1 kHz');
	await page.getByRole('button', { name: 'Pause' }).click();
	await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
	await page.getByRole('button', { name: 'Next track' }).click();
	await expect(page.getByTestId('playback-dock')).toContainText('Second track');
	await page.getByRole('button', { name: 'Previous track' }).click();
	await expect(page.getByTestId('playback-dock')).toContainText('Test track');

	const seek = page.getByRole('slider', { name: 'Playback position' });
	const playbackTrack = page.locator('[data-range-control="playback"] .range-control-track');
	const volumeTrack = page.locator('[data-range-control="volume"] .range-control-track');
	await expect(seek).toHaveCount(1);
	await expect(playbackTrack).toHaveCSS('block-size', '4px');
	await seek.focus();
	await expect(seek).toBeFocused();
	await expect(seek).toHaveCSS('outline-width', '3px');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Shift+Tab');
	await expect(seek).toBeFocused();
	await expect(playbackTrack).toHaveCSS('block-size', '8px');
	await seek.hover();
	await expect(playbackTrack).toHaveCSS('block-size', '8px');
	await page.mouse.move(400, 400);
	await expect(playbackTrack).toHaveCSS('block-size', '8px');
	await seek.fill('60000');
	await expect(page.getByTestId('playback-dock')).toContainText('1:00');
	await seek.press('Enter');
	await expect(page.getByTestId('playback-dock')).toContainText('1:00');
	await expect(seek).toHaveValue('60000');
	await expect(playbackTrack).toHaveCSS('opacity', '1');
	const volume = page.getByRole('slider', { name: 'Volume' });
	const volumeControl = page.locator('[data-range-control="volume"]');
	const volumeReadout = page.locator('[data-region="volume-readout"]');
	await expect(volumeControl).toHaveCSS('width', '144px');
	await expect(volumeReadout).toHaveCSS('width', '72px');
	await volume.focus();
	await expect(playbackTrack).toHaveCSS('block-size', '4px');
	await expect(volumeTrack).toHaveCSS('block-size', '8px');
	await volume.hover();
	await expect(volumeTrack).toHaveCSS('block-size', '8px');
	await page.mouse.move(400, 400);
	await expect(volumeTrack).toHaveCSS('block-size', '8px');
	await volume.blur();
	await expect(volumeTrack).toHaveCSS('block-size', '4px');
	await volume.click();
	await expect(volume).toBeFocused();
	await volume.hover();
	await page.mouse.move(400, 400);
	await expect(volumeTrack).toHaveCSS('block-size', '8px');
	await volume.blur();
	await expect(volumeTrack).toHaveCSS('block-size', '4px');
	await volume.fill('0.42');
	await expect(volume).toHaveValue('0.42');
	await expect(page.getByTestId('playback-dock')).toContainText('-7.5 dB');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await seek.focus();
	await expect(playbackTrack).toHaveCSS('transition-duration', '0s');
	await expect(playbackTrack).toHaveCSS('block-size', '8px');
	await page.getByRole('button', { name: 'Mute' }).click();
	await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
	await expect(volumeControl).toHaveAttribute('data-muted', '');
	await expect(volume).toHaveValue('0.42');
	await expect(volume).toHaveAttribute('aria-valuetext', 'Muted');
	await expect(volumeReadout).toHaveText('−∞ dB');
	await expect(volumeTrack).toHaveAttribute('style', /--md-state-range-progress:\s*42/);
	await expect
		.poll(() => volumeTrack.evaluate((element) => getComputedStyle(element).backgroundImage))
		.toContain('rgb(207, 196, 197)');
	await volume.fill('0.5');
	await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible();
	await expect(volumeControl).not.toHaveAttribute('data-muted');
	await expect(volume).toHaveValue('0.5');
	await expect(volumeReadout).toHaveText('-6.0 dB');

	const missing = page.getByRole('button', { name: 'Play Missing track' });
	await expect(missing).toBeDisabled();
	await expect(missing.getByText('Missing', { exact: true })).toBeVisible();
});

test('uses AlertDialog keyboard focus and cancel behavior', async ({ page }) => {
	await page.goto('/library/albums');
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

test('empty library remains interactive across routes', async ({ page }) => {
	const errors: Error[] = [];
	page.on('pageerror', (error) => errors.push(error));

	await page.goto('/library/albums');
	const albums = page.getByRole('link', { name: 'Albums' });
	await expect(albums).toHaveAttribute('aria-current', 'page');

	const artists = page.getByRole('link', { name: 'Album Artists' });
	await artists.click();
	await expect(page).toHaveURL(/\/library\/album-artists$/);
	await expect(artists).toHaveAttribute('aria-current', 'page');

	const tracks = page.getByRole('link', { name: 'Tracks' });
	await tracks.click();
	await expect(page).toHaveURL(/\/library\/tracks$/);
	await expect(tracks).toHaveAttribute('aria-current', 'page');

	await page.getByRole('link', { name: 'Settings' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.locator('[data-page="settings"]')).toBeVisible();
	await page.getByRole('link', { name: 'Albums' }).click();
	await expect(page).toHaveURL(/\/library\/albums$/);
	await expect(page.locator('[data-page="library"]')).toBeVisible();

	expect(errors).toEqual([]);
});

test('retains peer presentation filters and scroll context across Settings', async ({ page }) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Albums' }).click();

	const filter = page.getByRole('searchbox', { name: 'Filter library' });
	await filter.fill('Album');
	await page.waitForTimeout(200);
	const tracksLink = page.getByRole('link', { name: 'Tracks' });
	await tracksLink.click();
	await expect(page).toHaveURL(/\/library\/tracks$/);
	await filter.fill('track');
	await page.waitForTimeout(200);
	await page.getByRole('link', { name: 'Settings' }).click();
	await tracksLink.click();
	await expect(filter).toHaveValue('track');
	await page.getByRole('link', { name: 'Albums' }).click();
	await expect(filter).toHaveValue('Album');
});
