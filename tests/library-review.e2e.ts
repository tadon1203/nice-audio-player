import { expect, test } from '@playwright/test';
import { installNativeAppFixture } from './fixtures/native-app';

test.beforeEach(async ({ page }) => installNativeAppFixture(page));

test('renders distinct content for every Library presentation', async ({ page }, testInfo) => {
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Library' }).click();

	const presentations = [
		{ tab: 'Albums', content: page.getByRole('button', { name: /Play album Test album/ }) },
		{
			tab: 'Album Artists',
			content: page.getByRole('button', { name: 'Browse albums by Test artist' })
		},
		{ tab: 'Tracks', content: page.getByRole('button', { name: 'Play Test track' }) }
	] as const;

	for (const presentation of presentations) {
		await page.getByRole('tab', { name: presentation.tab }).click();
		await expect(page.getByRole('tab', { name: presentation.tab })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(presentation.content).toBeVisible();
		const screenshotName = `library-${presentation.tab.toLowerCase().replaceAll(' ', '-')}.png`;
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

test('keeps the selected Library panel as the only visible panel', async ({ page }) => {
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Library' }).click();

	const panels = page.locator('[role="tabpanel"]');
	await expect(panels).toHaveCount(3);

	for (const tab of ['Albums', 'Album Artists', 'Tracks']) {
		await page.getByRole('tab', { name: tab }).click();
		await expect(page.locator('[role="tabpanel"]').filter({ visible: true })).toHaveCount(1);
	}
});

test('drills from an Album Artist into its Albums', async ({ page }) => {
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Library' }).click();
	await page.getByRole('tab', { name: 'Album Artists' }).click();

	const artist = page.getByRole('button', { name: 'Browse albums by Test artist' });
	await artist.focus();
	await artist.press('Enter');
	await expect(page.getByRole('tab', { name: 'Albums' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('searchbox', { name: 'Filter library' })).toHaveValue('Test artist');
	await expect(page.getByRole('button', { name: /Play album Test album/ })).toBeVisible();
});

test('keeps the Albums grid aligned with the shared page frame', async ({ page }) => {
	await page.setViewportSize({ width: 1800, height: 1000 });
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Library' }).click();
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
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Library' }).click();
	for (const tab of ['Albums', 'Album Artists', 'Tracks']) {
		await page.getByRole('tab', { name: tab }).click();
		const scrollRegion = page
			.locator('[role="tabpanel"]')
			.filter({ visible: true })
			.locator('[data-library-scroll-region]');
		await expect(scrollRegion).toHaveCount(1);
		const metrics = await scrollRegion.evaluate((element) => ({
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth
		}));

		expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
	}
});
