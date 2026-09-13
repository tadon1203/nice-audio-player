import { expect, test, type Locator } from '@playwright/test';
import { installNativeAppFixture } from './fixtures/native-app';

test.beforeEach(async ({ page }) => installNativeAppFixture(page));

test.use({ viewport: { width: 1360, height: 900 } });

test('renders distinct content for every Library presentation', async ({ page }, testInfo) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Albums' }).click();

	const presentations = [
		{ route: 'Albums', content: page.getByRole('button', { name: /Open album Test album/ }) },
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
		{ label: 'Album Artists', count: '8 album artists' },
		{ label: 'Tracks', count: '5 tracks' }
	]) {
		await page.getByRole('link', { name: presentation.label }).click();
		await expect(page.getByText(presentation.count, { exact: true })).toBeVisible();
		await expect(page.getByText('Filter', { exact: true })).toHaveCount(0);
	}
});

test('keeps Tracks table headers and rows on the same geometry', async ({ page }) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Tracks' }).click();

	await expectTrackTableGeometry(page.getByRole('table', { name: 'Library tracks' }), 4);
});

test('keeps every page scroll region aligned with its owning layout frame', async ({ page }) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();

	for (const route of [
		'/library/tracks',
		'/library/albums/Test%20artist/Test%20album',
		'/settings'
	]) {
		await page.goto(route);
		const mainBox = await page.locator('main[data-slot="app-main"]').boundingBox();
		const scrollBox = await page.locator('[data-scroll-region]').boundingBox();
		expect(mainBox).not.toBeNull();
		expect(scrollBox).not.toBeNull();
		if (!mainBox || !scrollBox) return;
		const frame =
			(await page.locator('[data-page="library"]').count()) > 0
				? page.locator('[data-page="library"] app-page-frame').nth(1)
				: page.locator('main[data-slot="app-main"]');
		const frameContent = await frame.evaluate((element) => {
			const styles = getComputedStyle(element);
			const box = element.getBoundingClientRect();
			return {
				left: box.left + Number.parseFloat(styles.paddingLeft),
				right: box.right - Number.parseFloat(styles.paddingRight)
			};
		});
		expect(Math.abs(scrollBox.x - frameContent.left)).toBeLessThanOrEqual(1);
		expect(Math.abs(scrollBox.x + scrollBox.width - frameContent.right)).toBeLessThanOrEqual(1);
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
	await expect(page).toHaveURL(/\/library\/album-artists\/Test%20artist$/);
	await expect(page.getByRole('heading', { name: 'Test artist' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open album Test album' })).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Sort by Sort' })).toHaveValue('year');
});

test('keeps the Albums grid aligned with the shared page frame', async ({ page }) => {
	await page.setViewportSize({ width: 1800, height: 1000 });
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Albums' }).click();
	await expect(page.getByRole('button', { name: /Open album Test album/ })).toBeVisible();

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

test('keeps the Library search aligned to the full header frame', async ({ page }) => {
	await page.goto('/library/albums');
	const headerFrame = page.locator('app-library-page header app-page-frame');
	const search = page.getByRole('searchbox', { name: 'Filter library' });
	await expect(search).toBeVisible();

	const expectedSearchRight = await headerFrame.evaluate((element) => {
		const frameStyles = getComputedStyle(element);
		const searchLabel = element.querySelector('label');
		if (!searchLabel) throw new Error('Library search label is missing');
		const frame = element.getBoundingClientRect();
		const labelStyles = getComputedStyle(searchLabel);
		return (
			frame.right -
			Number.parseFloat(frameStyles.paddingRight) -
			Number.parseFloat(labelStyles.marginRight)
		);
	});
	const positions: Array<{ x: number; y: number; right: number }> = [];

	for (const route of ['Albums', 'Album Artists', 'Tracks']) {
		await page.getByRole('link', { name: route }).click();
		await expect(page.getByRole('heading', { name: route })).toBeVisible();
		const box = await search.boundingBox();
		expect(box).not.toBeNull();
		if (!box) return;
		positions.push({ x: box.x, y: box.y, right: box.x + box.width });
	}

	for (const position of positions) {
		expect(Math.abs(position.right - expectedSearchRight)).toBeLessThanOrEqual(1);
	}
	for (const position of positions.slice(1)) {
		expect(Math.abs(position.x - positions[0].x)).toBeLessThanOrEqual(1);
		expect(Math.abs(position.y - positions[0].y)).toBeLessThanOrEqual(1);
	}
});

test('keeps Album Artists header controls inside the Electron-sized frame', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Album Artists' }).click();

	const frame = page.locator('app-library-page header app-page-frame');
	const search = page.getByRole('searchbox', { name: 'Filter library' });
	const sort = page.locator('app-sort-control');
	await expect(search).toBeVisible();
	await expect(sort).toBeVisible();

	const frameContentRight = await frame.evaluate((element) => {
		const styles = getComputedStyle(element);
		const box = element.getBoundingClientRect();
		return box.right - Number.parseFloat(styles.paddingRight);
	});
	const [searchBox, sortBox] = await Promise.all([search.boundingBox(), sort.boundingBox()]);
	expect(searchBox).not.toBeNull();
	expect(sortBox).not.toBeNull();
	if (!searchBox || !sortBox) return;

	expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(frameContentRight + 1);
	expect(sortBox.x + sortBox.width).toBeLessThanOrEqual(frameContentRight + 1);
});

test('keeps Album Artists content inside the frame at the wide-grid boundary', async ({ page }) => {
	await page.setViewportSize({ width: 1120, height: 800 });
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Album Artists' }).click();

	const main = page.locator('main[data-slot="app-main"]');
	const frame = page.locator('app-library-page app-page-frame').nth(1);
	const grid = page.getByTestId('album-artist-grid');
	await expect(grid).toBeVisible();

	const metrics = await Promise.all([
		main.boundingBox(),
		frame.boundingBox(),
		grid.boundingBox(),
		grid.evaluate((element) => ({
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth,
			columns: getComputedStyle(element).gridTemplateColumns
		}))
	]);
	const [mainBox, frameBox, gridBox, gridMetrics] = metrics;
	expect(mainBox).not.toBeNull();
	expect(frameBox).not.toBeNull();
	expect(gridBox).not.toBeNull();
	if (!mainBox || !frameBox || !gridBox) return;

	expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(1120);
	expect(frameBox.x + frameBox.width).toBeLessThanOrEqual(mainBox.x + mainBox.width + 1);
	expect(gridBox.x + gridBox.width).toBeLessThanOrEqual(frameBox.x + frameBox.width + 1);
	expect(gridMetrics.scrollWidth).toBeLessThanOrEqual(gridMetrics.clientWidth);
	expect(gridMetrics.columns.split(' ').length).toBe(3);
});

test('matches the Album Artists reference geometry at the desktop viewport', async ({ page }) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Album Artists' }).click();
	await expect(page.getByTestId('album-artist-grid')).toBeVisible();

	const grid = page.getByTestId('album-artist-grid');
	const artworks = grid.locator('app-artwork');
	await expect(artworks).toHaveCount(8);
	const [gridBox, firstBox, secondBox, secondRowBox, dockBox, statusBox, navigationBox] =
		await Promise.all([
			grid.boundingBox(),
			artworks.nth(0).boundingBox(),
			artworks.nth(1).boundingBox(),
			artworks.nth(4).boundingBox(),
			page.getByTestId('playback-dock').boundingBox(),
			page.getByTestId('playback-status-bar').boundingBox(),
			page.getByRole('navigation', { name: 'Application' }).boundingBox()
		]);

	for (const box of [
		gridBox,
		firstBox,
		secondBox,
		secondRowBox,
		dockBox,
		statusBox,
		navigationBox
	]) {
		expect(box).not.toBeNull();
	}
	if (
		!gridBox ||
		!firstBox ||
		!secondBox ||
		!secondRowBox ||
		!dockBox ||
		!statusBox ||
		!navigationBox
	)
		return;

	expect(Math.abs(gridBox.x - 264)).toBeLessThanOrEqual(1);
	expect(Math.abs(firstBox.x - 264)).toBeLessThanOrEqual(1);
	expect(Math.abs(firstBox.width - 220)).toBeLessThanOrEqual(1);
	expect(Math.abs(firstBox.height - 220)).toBeLessThanOrEqual(1);
	expect(Math.abs(secondBox.x - firstBox.x - 260)).toBeLessThanOrEqual(1);
	expect(Math.abs(secondRowBox.y - firstBox.y - 320)).toBeLessThanOrEqual(1);
	expect(Math.abs(dockBox.y - 812)).toBeLessThanOrEqual(1);
	expect(Math.abs(statusBox.y - 876)).toBeLessThanOrEqual(1);
	expect(navigationBox.width).toBe(224);
});

test('opens Album Details with the shared track table', async ({ page }) => {
	await page.goto('/library/albums');
	await page.getByRole('link', { name: 'Settings' }).click();
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('link', { name: 'Albums' }).click();
	await page.getByRole('button', { name: /Open album Test album/ }).click();

	await expect(page).toHaveURL(/\/library\/albums\/Test%20artist\/Test%20album$/);
	await expect(page.getByRole('heading', { name: 'Test album' })).toBeVisible();
	await expect(page.getByRole('table', { name: 'Album tracks' })).toBeVisible();
	await expectTrackTableGeometry(page.getByRole('table', { name: 'Album tracks' }), 5);
	await expect(page.getByRole('button', { name: 'Play album' })).toBeVisible();
	await expect(page.getByText('Inspector', { exact: true })).toHaveCount(0);

	await page.locator('[data-page="album-details"]').getByRole('link', { name: 'Albums' }).click();
	await expect(page).toHaveURL(/\/library\/albums$/);
});

async function expectTrackTableGeometry(table: Locator, columnCount: number): Promise<void> {
	await expect(table).toBeVisible();
	await expect(table).toHaveCSS('table-layout', 'fixed');

	const headers = table.locator('thead th');
	const rows = table.locator('tbody tr');
	await expect(headers).toHaveCount(columnCount);
	await expect(rows).not.toHaveCount(0);

	const headerBoxes = await headers.evaluateAll((elements) =>
		elements.map((element) => {
			const { x, width, right } = element.getBoundingClientRect();
			return { x, width, right };
		})
	);
	const headerPadding = await headers.first().evaluate((element) => {
		const styles = getComputedStyle(element);
		return { left: styles.paddingLeft, right: styles.paddingRight };
	});
	const cellPadding = await rows
		.first()
		.locator('td')
		.first()
		.evaluate((element) => {
			const styles = getComputedStyle(element);
			return { left: styles.paddingLeft, right: styles.paddingRight };
		});
	expect(headerPadding).toEqual(cellPadding);
	const firstRowMetrics = await rows.first().evaluate((element) => ({
		computedHeight: Number.parseFloat(getComputedStyle(element).height),
		rectHeight: element.getBoundingClientRect().height
	}));
	expect(firstRowMetrics.computedHeight).toBeGreaterThanOrEqual(44);
	expect(firstRowMetrics.computedHeight).toBeLessThanOrEqual(45);
	expect(firstRowMetrics.rectHeight).toBeGreaterThanOrEqual(44);
	expect(firstRowMetrics.rectHeight).toBeLessThanOrEqual(45);

	for (let rowIndex = 0; rowIndex < (await rows.count()); rowIndex += 1) {
		const cells = rows.nth(rowIndex).locator('td');
		const cellBoxes = await cells.evaluateAll((elements) =>
			elements.map((element) => {
				const { x, width, right } = element.getBoundingClientRect();
				return { x, width, right };
			})
		);
		await expect(cells).toHaveCount(columnCount);

		for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
			const header = headerBoxes[columnIndex];
			const cell = cellBoxes[columnIndex];
			expect(Math.abs(header.x - cell.x)).toBeLessThanOrEqual(1);
			expect(Math.abs(header.width - cell.width)).toBeLessThanOrEqual(1);
			expect(Math.abs(header.right - cell.right)).toBeLessThanOrEqual(1);
		}
	}
}

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
