import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('library has no accessibility violations', async ({ page }) => {
	await page.goto('/library');
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});

test('settings has no accessibility violations', async ({ page }) => {
	await page.goto('/settings');
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
