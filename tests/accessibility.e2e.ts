import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { installNativeAppFixture } from './fixtures/native-app';

test('library has no accessibility violations', async ({ page }) => {
	await page.goto('/library');
	await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});

test('settings has no accessibility violations', async ({ page }) => {
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});

test('populated library has no accessibility violations', async ({ page }) => {
	await installNativeAppFixture(page);
	await page.goto('/library');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Library' }).click();
	await expect(page.getByRole('button', { name: /Play album Test album/ })).toBeVisible();
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
