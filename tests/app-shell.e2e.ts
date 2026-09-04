import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, supportedViewports } from './helpers';

test('redirects the root to Library and navigates semantically', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/library$/);
	await expect(page.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
	await page.getByRole('link', { name: 'Settings' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await page.goBack();
	await expect(page).toHaveURL(/\/library$/);
	await page.goForward();
	await expect(page).toHaveURL(/\/settings$/);
});

for (const viewport of supportedViewports) {
	test(`shell fits ${viewport.width}px viewport`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.goto('/library');
		await expect(page.getByTestId('app-shell')).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});
}
