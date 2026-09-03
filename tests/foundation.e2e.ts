import { expect, test } from '@playwright/test';

test('renders the foundation screen in Chromium', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('Nice Audio Player');
	await expect(page.getByRole('heading', { name: 'Application foundation ready.' })).toBeVisible();
});
