import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, supportedViewports } from './helpers';

test('redirects the root to Library and navigates semantically', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/library$/);
	const libraryLink = page.getByRole('link', { name: 'Library' });
	const settingsLink = page.getByRole('link', { name: 'Settings' });
	await expect(libraryLink).toHaveAttribute('aria-current', 'page');
	const libraryColor = await libraryLink.evaluate((element) => getComputedStyle(element).color);
	const settingsColor = await settingsLink.evaluate((element) => getComputedStyle(element).color);
	expect(libraryColor).not.toBe(settingsColor);
	await settingsLink.click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(settingsLink).toHaveAttribute('aria-current', 'page');
	expect(await libraryLink.evaluate((element) => getComputedStyle(element).color)).toBe(
		settingsColor
	);
	expect(await settingsLink.evaluate((element) => getComputedStyle(element).color)).toBe(
		libraryColor
	);
	await page.goBack();
	await expect(page).toHaveURL(/\/library$/);
	await page.goForward();
	await expect(page).toHaveURL(/\/settings$/);
});

test('supports keyboard navigation with a visible focus indicator', async ({ page }) => {
	await page.goto('/library');

	const libraryLink = page.getByRole('link', { name: 'Library' });
	const settingsLink = page.getByRole('link', { name: 'Settings' });

	await page.locator('body').press('Tab');
	await expect(libraryLink).toBeFocused();
	await expect(libraryLink).toHaveCSS('outline-style', 'solid');
	await expect(libraryLink).toHaveCSS('outline-width', '2px');

	await page.locator('body').press('Tab');
	await expect(settingsLink).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/settings$/);
});

for (const viewport of supportedViewports) {
	test(`shell fits ${viewport.width}px viewport`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.goto('/library');
		await expect(page.getByTestId('app-shell')).toBeVisible();
		await expectNoHorizontalOverflow(page);
		if (viewport.width >= 800) {
			const workspaceBox = await page.locator('[data-slot="app-workspace"]').boundingBox();
			const navigationBox = await page
				.getByRole('navigation', { name: 'Application' })
				.boundingBox();

			expect(workspaceBox).not.toBeNull();
			expect(navigationBox).not.toBeNull();
			expect(
				Math.abs(
					navigationBox!.y + navigationBox!.height - (workspaceBox!.y + workspaceBox!.height)
				)
			).toBeLessThanOrEqual(1);
		}
	});
}
