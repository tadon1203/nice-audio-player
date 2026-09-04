import { expect, type Page } from '@playwright/test';

export const supportedViewports = [
	{ width: 640, height: 800 },
	{ width: 799, height: 600 },
	{ width: 800, height: 600 },
	{ width: 1120, height: 700 },
	{ width: 1439, height: 900 },
	{ width: 1440, height: 900 }
] as const;

export async function expectNoHorizontalOverflow(page: Page) {
	const dimensions = await page.locator('html').evaluate((element) => ({
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth
	}));
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}
