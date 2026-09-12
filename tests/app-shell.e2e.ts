import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, supportedViewports } from './helpers';

test('redirects the root to Albums and navigates semantically', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/library\/albums$/);
	const albumsLink = page.getByRole('link', { name: 'Albums' });
	const settingsLink = page.getByRole('link', { name: 'Settings' });
	await expect(albumsLink).toHaveAttribute('aria-current', 'page');
	const albumsColor = await albumsLink.evaluate((element) => getComputedStyle(element).color);
	const settingsColor = await settingsLink.evaluate((element) => getComputedStyle(element).color);
	expect(albumsColor).not.toBe(settingsColor);
	await settingsLink.click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(settingsLink).toHaveAttribute('aria-current', 'page');
	expect(await albumsLink.evaluate((element) => getComputedStyle(element).color)).toBe(
		settingsColor
	);
	expect(await settingsLink.evaluate((element) => getComputedStyle(element).color)).toBe(
		albumsColor
	);
	await page.goBack();
	await expect(page).toHaveURL(/\/library\/albums$/);
	await page.goForward();
	await expect(page).toHaveURL(/\/settings$/);
});

test('supports keyboard navigation with a visible focus indicator', async ({ page }) => {
	await page.goto('/library/albums');

	const albumsLink = page.getByRole('link', { name: 'Albums' });
	const artistsLink = page.getByRole('link', { name: 'Album Artists' });
	const settingsLink = page.getByRole('link', { name: 'Settings' });

	await page.locator('body').press('Tab');
	await expect(albumsLink).toBeFocused();
	await expect(albumsLink).toHaveCSS('outline-style', 'solid');
	await expect(albumsLink).toHaveCSS('outline-width', '2px');

	await page.locator('body').press('Tab');
	await expect(artistsLink).toBeFocused();
	expect(await artistsLink.getAttribute('aria-current')).toBeNull();
	await settingsLink.focus();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/settings$/);
});

for (const viewport of supportedViewports) {
	test(`shell fits ${viewport.width}px viewport`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.goto('/library/albums');
		await expect(page.getByTestId('app-shell')).toBeVisible();
		await expectNoHorizontalOverflow(page);
		if (viewport.width >= 800) {
			const workspaceBox = await page.locator('[data-slot="app-workspace"]').boundingBox();
			const navigationBox = await page
				.getByRole('navigation', { name: 'Application' })
				.boundingBox();

			expect(workspaceBox).not.toBeNull();
			expect(navigationBox).not.toBeNull();
			expect(navigationBox!.width).toBe(224);
			expect(
				Math.abs(
					navigationBox!.y + navigationBox!.height - (workspaceBox!.y + workspaceBox!.height)
				)
			).toBeLessThanOrEqual(1);
		}
	});
}
