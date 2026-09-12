import { expect, test } from '@playwright/test';
import { installNativeAppFixture } from './fixtures/native-app';

test.beforeEach(async ({ page }) => installNativeAppFixture(page));

test.use({ viewport: { width: 1360, height: 900 } });

test('renders distinct content for every Library presentation', async ({ page }, testInfo) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Albums' }).click();

	const presentations = [
		{ route: 'Albums', content: page.getByRole('button', { name: /Play album Test album/ }) },
		{
			route: 'Album Artists',
			content: page.getByRole('button', { name: 'Browse albums by Test artist' })
		},
		{ route: 'Tracks', content: page.getByRole('button', { name: 'Play Test track' }) }
	] as const;

	for (const presentation of presentations) {
		await page.getByRole('link', { name: presentation.route }).click();
		await expect(page.getByRole('link', { name: presentation.route })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(presentation.content).toBeVisible();
		const screenshotName = `library-${presentation.route.toLowerCase().replaceAll(' ', '-')}.png`;
		await page.screenshot({
			path: testInfo.outputPath(screenshotName),
			fullPage: true
		});
		await expect(page).toHaveScreenshot(screenshotName, {
			animations: 'disabled',
			fullPage: true
		});
	}
});

test('navigates each Library presentation as a distinct route', async ({ page }) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Albums' }).click();

	for (const route of [
		{ label: 'Albums', path: '/library/albums' },
		{ label: 'Album Artists', path: '/library/album-artists' },
		{ label: 'Tracks', path: '/library/tracks' }
	]) {
		await page.getByRole('link', { name: route.label }).click();
		await expect(page).toHaveURL(new RegExp(`${route.path.replaceAll('/', '\\/')}$`));
		await expect(page.getByRole('link', { name: route.label })).toHaveAttribute(
			'aria-current',
			'page'
		);
	}
});

test('shows the backend total for each Library presentation', async ({ page }) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Albums' }).click();

	for (const presentation of [
		{ label: 'Albums', count: '1 album' },
		{ label: 'Album Artists', count: '1 album artist' },
		{ label: 'Tracks', count: '5 tracks' }
	]) {
		await page.getByRole('link', { name: presentation.label }).click();
		await expect(page.getByText(presentation.count, { exact: true })).toBeVisible();
		await expect(page.getByText('Filter', { exact: true })).toHaveCount(0);
	}
});

test('drills from an Album Artist into its Albums', async ({ page }) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Album Artists' }).click();

	const artist = page.getByRole('button', { name: 'Browse albums by Test artist' });
	await artist.focus();
	await artist.press('Enter');
	await expect(page).toHaveURL(/\/library\/albums$/);
	await expect(page.getByRole('searchbox', { name: 'Filter library' })).toHaveValue('Test artist');
	await expect(page.getByRole('button', { name: /Play album Test album/ })).toBeVisible();
});

test('keeps the Albums grid aligned with the shared page frame', async ({ page }) => {
	await page.setViewportSize({ width: 1800, height: 1000 });
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Albums' }).click();
	await expect(page.getByRole('button', { name: /Play album Test album/ })).toBeVisible();

	const pageFrames = page.locator('app-page-frame');
	const headerFrame = pageFrames.nth(0);
	const albumFrame = pageFrames.nth(1);
	const albumGrid = page.locator('app-album-grid .grid').first();
	const [headerBox, albumFrameBox, gridBox] = await Promise.all([
		headerFrame.boundingBox(),
		albumFrame.boundingBox(),
		albumGrid.boundingBox()
	]);

	expect(headerBox).not.toBeNull();
	expect(albumFrameBox).not.toBeNull();
	expect(gridBox).not.toBeNull();
	if (!headerBox || !albumFrameBox || !gridBox) return;

	const contentLeft = await albumFrame.evaluate((element) => {
		const styles = getComputedStyle(element);
		return element.getBoundingClientRect().left + Number.parseFloat(styles.paddingLeft);
	});
	const headerContentLeft = await headerFrame.evaluate((element) => {
		const styles = getComputedStyle(element);
		return element.getBoundingClientRect().left + Number.parseFloat(styles.paddingLeft);
	});
	expect(Math.abs(headerContentLeft - contentLeft)).toBeLessThanOrEqual(1);
	expect(Math.abs(contentLeft - gridBox.x)).toBeLessThanOrEqual(1);
});

test('keeps every Library presentation inside a narrow viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	for (const route of ['/library/albums', '/library/album-artists', '/library/tracks']) {
		await page.goto(route);
		const scrollRegion = page.locator('[data-library-scroll-region]');
		await expect(scrollRegion).toHaveCount(1);
		const metrics = await scrollRegion.evaluate((element) => ({
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth
		}));

		expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
	}
});
