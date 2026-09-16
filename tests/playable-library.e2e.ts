import { expect, test, type Locator } from '@playwright/test';
import { installNativeAppFixture } from './fixtures/native-app';

test.beforeEach(async ({ page }) => installNativeAppFixture(page));

test('connects folder registration, scan, catalog selection, and playback dock', async ({
	page
}) => {
	const clickSliderAt = async (track: Locator, fraction: number) => {
		const box = await track.boundingBox();
		expect(box).not.toBeNull();
		if (!box) return;
		await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
	};

	await page.goto('/library/albums');
	for (const label of ['Albums', 'Album Artists', 'Tracks', 'Settings']) {
		const icon = page.getByRole('link', { name: label }).locator('ng-icon');
		await expect(icon).toHaveCSS('width', '16px');
		await expect(icon).toHaveCSS('height', '16px');
	}
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
	const transportIcons = page.locator('[data-region="playback-core"] ng-icon');
	await expect(transportIcons).toHaveCount(3);
	for (let index = 0; index < 3; index += 1) {
		await expect(transportIcons.nth(index)).toHaveCSS('width', '20px');
		await expect(transportIcons.nth(index)).toHaveCSS('height', '20px');
	}
	const playbackStatusLabel = page.getByText('Playing', { exact: true });
	await expect(playbackStatusLabel).toHaveText('Playing');
	await expect(playbackStatusLabel).toHaveCSS('font-size', '14px');
	await expect(playbackStatusLabel).toHaveCSS('line-height', '20px');
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
	const pauseButton = page.getByRole('button', { name: 'Pause' });
	const pauseBox = await pauseButton.boundingBox();
	expect(pauseBox).not.toBeNull();
	if (!pauseBox) return;
	await page.mouse.move(pauseBox.x + pauseBox.width / 2, pauseBox.y + pauseBox.height / 2);
	await page.mouse.down();
	const pressedPauseBox = await pauseButton.boundingBox();
	expect(pressedPauseBox).not.toBeNull();
	if (!pressedPauseBox) return;
	expect(Math.abs(pressedPauseBox.x - pauseBox.x)).toBeLessThanOrEqual(1);
	expect(Math.abs(pressedPauseBox.y - pauseBox.y)).toBeLessThanOrEqual(1);
	await page.mouse.up();
	await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

	const seek = page.getByRole('slider', { name: 'Playback position' });
	const playbackControl = page.locator('app-range-control').filter({ has: seek });
	const playbackTrack = playbackControl.locator('[brnSliderTrack]');
	const volume = page.getByRole('slider', { name: 'Volume' });
	const volumeControl = page.locator('app-range-control').filter({ has: volume });
	const volumeTrack = volumeControl.locator('[brnSliderTrack]');
	const volumeRange = volumeControl.locator('[brnSliderRange]');
	const readDockGeometry = async () =>
		page.evaluate(() => {
			const box = (element: Element | null) => {
				if (!element) throw new Error('Expected playback geometry element');
				const { x, y, width, height } = element.getBoundingClientRect();
				return { x, y, width, height };
			};
			const rangeControls = [...document.querySelectorAll('app-range-control')];
			const rangeFor = (label: string) =>
				rangeControls.find((control) => control.querySelector(`[aria-label="${label}"]`)) ?? null;
			return {
				dock: box(document.querySelector('[data-testid="playback-dock"]')),
				identity: box(document.querySelector('[data-region="playback-identity"]')),
				transport: box(document.querySelector('[data-region="playback-core"]')),
				volume: box(document.querySelector('[data-region="volume"]')),
				seekHost: box(rangeFor('Playback position')),
				volumeHost: box(rangeFor('Volume')),
				seekTrack: box(rangeFor('Playback position')?.querySelector('[brnSliderTrack]') ?? null),
				volumeTrack: box(rangeFor('Volume')?.querySelector('[brnSliderTrack]') ?? null)
			};
		});
	const expectStableGeometry = (
		before: Awaited<ReturnType<typeof readDockGeometry>>,
		after: Awaited<ReturnType<typeof readDockGeometry>>
	) => {
		for (const region of [
			'dock',
			'identity',
			'transport',
			'volume',
			'seekHost',
			'volumeHost'
		] as const) {
			for (const property of ['x', 'y', 'width', 'height'] as const) {
				expect(Math.abs(after[region][property] - before[region][property])).toBeLessThanOrEqual(1);
			}
		}
	};
	await expect(seek).toHaveCount(1);
	await expect(playbackControl).toHaveCSS('height', '4px');
	await expect(playbackTrack).toHaveCSS('block-size', '4px');
	await seek.focus();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Shift+Tab');
	await expect(seek).toBeFocused();
	await expect(seek).toHaveCSS('outline-width', '2px');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Shift+Tab');
	await expect(seek).toBeFocused();
	await expect(playbackTrack).toHaveCSS('block-size', '4px');
	await seek.hover();
	await expect(playbackTrack).toHaveCSS('block-size', '8px');
	await page.mouse.move(400, 400);
	await expect(playbackTrack).toHaveCSS('block-size', '4px');
	await clickSliderAt(playbackTrack, 0.5);
	await expect(page.getByTestId('playback-dock')).toContainText('1:00');
	await expect(seek).toHaveAttribute('aria-valuenow', '60000');
	await expect(playbackTrack).toHaveCSS('opacity', '1');
	const volumeReadout = page.locator('[data-region="volume-readout"]');
	await expect(volumeControl).toHaveCSS('height', '40px');
	await expect(volumeReadout).toBeVisible();
	await page.mouse.move(400, 400);
	await volume.focus();
	await expect(playbackTrack).toHaveCSS('block-size', '4px');
	await expect(volumeTrack).toHaveCSS('block-size', '4px');
	await volume.hover();
	await expect(volumeTrack).toHaveCSS('block-size', '8px');
	await page.mouse.move(400, 400);
	await expect(volumeTrack).toHaveCSS('block-size', '4px');
	await volume.blur();
	await expect(volumeTrack).toHaveCSS('block-size', '4px');
	await volume.click();
	await expect(volume).toBeFocused();
	await volume.hover();
	await page.mouse.move(400, 400);
	await expect(volumeTrack).toHaveCSS('block-size', '4px');
	await volume.blur();
	await expect(volumeTrack).toHaveCSS('block-size', '4px');
	await clickSliderAt(volumeTrack, 0.42);
	await expect(volume).toHaveAttribute('aria-valuenow', '0.42');
	await expect(page.getByTestId('playback-dock')).toContainText('-7.5 dB');
	const normalGeometry = await readDockGeometry();
	for (const pair of [
		[normalGeometry.identity, normalGeometry.transport],
		[normalGeometry.identity, normalGeometry.volume]
	] as const) {
		expect(
			Math.abs(pair[0].y + pair[0].height / 2 - (pair[1].y + pair[1].height / 2))
		).toBeLessThanOrEqual(1);
	}
	expect(normalGeometry.seekHost.height).toBeCloseTo(4, 0);
	expect(normalGeometry.volumeHost.height).toBeCloseTo(40, 0);
	for (const [host, track] of [
		[normalGeometry.seekHost, normalGeometry.seekTrack],
		[normalGeometry.volumeHost, normalGeometry.volumeTrack]
	] as const) {
		expect(Math.abs(host.y + host.height / 2 - (track.y + track.height / 2))).toBeLessThanOrEqual(
			1
		);
	}
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await seek.focus();
	await expect(playbackTrack).toHaveCSS('transition-duration', '0s');
	await expect(playbackTrack).toHaveCSS('block-size', '4px');
	await page.getByRole('button', { name: 'Mute' }).click();
	const unmuteButton = page.getByRole('button', { name: 'Unmute' });
	await expect(unmuteButton).toBeVisible();
	await expect(unmuteButton).toBeEnabled();
	const mutedGeometry = await readDockGeometry();
	expectStableGeometry(normalGeometry, mutedGeometry);
	await expect(volumeControl.locator('hlm-slider')).toHaveAttribute('data-tone', 'subdued');
	await expect(volume).toHaveAttribute('aria-valuenow', '0.42');
	await expect(volume).toHaveAttribute('aria-valuetext', 'Muted');
	await expect(volumeReadout).toHaveText('−∞ dB');
	await expect(volumeRange).toHaveCSS('background-color', 'oklch(0.556 0 0)');
	await page.getByRole('button', { name: 'Unmute', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
	await expect(volumeControl.locator('hlm-slider')).toHaveAttribute('data-tone', 'default');
	const restoredGeometry = await readDockGeometry();
	expectStableGeometry(normalGeometry, restoredGeometry);

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
