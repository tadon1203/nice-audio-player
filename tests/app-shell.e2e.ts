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

test('uses the M3 theme roles and shape aliases', async ({ page }) => {
	await page.goto('/library/albums');

	const darkTokens = await page.evaluate(() => {
		const styles = getComputedStyle(document.documentElement);
		return {
			primary: styles.getPropertyValue('--md-sys-color-primary').trim(),
			onSurface: styles.getPropertyValue('--md-sys-color-on-surface').trim(),
			surfaceContainerLowest: styles
				.getPropertyValue('--md-sys-color-surface-container-lowest')
				.trim()
		};
	});
	expect(darkTokens).toEqual({
		primary: 'rgb(198 198 198)',
		onSurface: 'rgb(226 226 226)',
		surfaceContainerLowest: 'rgb(14 14 14)'
	});

	await expect(page.getByRole('searchbox', { name: 'Filter library' })).toHaveCSS(
		'border-radius',
		'4px'
	);
	await expect(page.getByRole('combobox', { name: 'Sort by Sort' })).toHaveCSS(
		'border-radius',
		'4px'
	);

	const lightTokens = await page.evaluate(() => {
		document.documentElement.dataset.theme = 'light';
		const styles = getComputedStyle(document.documentElement);
		return {
			primary: styles.getPropertyValue('--md-sys-color-primary').trim(),
			onSurface: styles.getPropertyValue('--md-sys-color-on-surface').trim(),
			surfaceContainerLowest: styles
				.getPropertyValue('--md-sys-color-surface-container-lowest')
				.trim()
		};
	});
	expect(lightTokens).toEqual({
		primary: 'rgb(0 0 0)',
		onSurface: 'rgb(27 27 27)',
		surfaceContainerLowest: 'rgb(255 255 255)'
	});
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
