import { expect, test, type Locator } from "@playwright/test";
import { installElectronApi } from "./fixtures/electron-api";

test.beforeEach(async ({ page }) => installElectronApi(page));

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function leftOf(locator: Locator) {
  return (await boxOf(locator)).x;
}

test("keeps workspace views on one shared left edge and fills media grids from the left", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("/library/albums");

  const albumsHeading = page.getByRole("heading", { name: "Albums", exact: true });
  const workspaceLeft = await leftOf(albumsHeading);
  const albums = page.getByRole("link", { name: /Open album .* by Test artist/ });
  const firstAlbum = await boxOf(albums.nth(0));
  const secondAlbum = await boxOf(albums.nth(1));

  expect(Math.abs(firstAlbum.x - workspaceLeft)).toBeLessThan(2);
  expect(secondAlbum.x).toBeGreaterThan(firstAlbum.x);
  expect(Math.abs(secondAlbum.y - firstAlbum.y)).toBeLessThan(2);

  await page.getByRole("link", { name: "Album Artists", exact: true }).click();
  const artistsHeading = page.getByRole("heading", { name: "Album Artists", exact: true });
  const firstArtist = page.getByRole("link", { name: "Browse albums by Test artist" });
  expect(Math.abs((await leftOf(artistsHeading)) - workspaceLeft)).toBeLessThan(2);
  expect(Math.abs((await leftOf(firstArtist)) - workspaceLeft)).toBeLessThan(2);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  expect(
    Math.abs((await leftOf(page.getByRole("heading", { name: "Settings" }))) - workspaceLeft),
  ).toBeLessThan(2);

  await page.getByRole("link", { name: "Albums", exact: true }).click();
  await albums.nth(0).click();
  const backToAlbums = page
    .getByRole("main")
    .getByRole("link", { name: "Albums", exact: true });
  expect(Math.abs((await leftOf(backToAlbums)) - workspaceLeft)).toBeLessThan(2);
});

test("keeps sort controls in one control row", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/library/albums");

  const select = page.getByRole("combobox", { name: "Sort library" });
  const direction = page.getByRole("button", { name: "Sort descending" });
  const selectBox = await boxOf(select);
  const directionBox = await boxOf(direction);

  expect(directionBox.x).toBeGreaterThan(selectBox.x + selectBox.width - 1);
  expect(
    Math.abs(directionBox.y + directionBox.height / 2 - (selectBox.y + selectBox.height / 2)),
  ).toBeLessThan(2);
});

test("uses the same sidebar tab geometry for library and settings navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/library/albums");

  const navigation = page.getByRole("navigation", { name: "Application" });
  const albums = await boxOf(navigation.getByRole("link", { name: "Albums", exact: true }));
  const settings = await boxOf(navigation.getByRole("link", { name: "Settings", exact: true }));

  expect(Math.abs(albums.x - settings.x)).toBeLessThan(2);
  expect(Math.abs(albums.width - settings.width)).toBeLessThan(2);
});

test("keeps transport centered between track identity and volume", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/library/albums");

  const dock = await boxOf(page.getByRole("contentinfo", { name: "Playback controls" }));
  const identity = await boxOf(page.locator('[data-region="playback-identity"]'));
  const core = await boxOf(page.locator('[data-region="playback-core"]'));
  const volume = await boxOf(page.locator('[data-region="volume"]'));

  expect(identity.x).toBeLessThan(core.x);
  expect(volume.x).toBeGreaterThan(core.x);
  expect(Math.abs(core.x + core.width / 2 - (dock.x + dock.width / 2))).toBeLessThan(2);
});

test("keeps album track number compact while title owns the flexible column", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();

  const table = page.getByRole("table", { name: "Album tracks" });
  const number = await boxOf(table.getByRole("columnheader", { name: "#", exact: true }));
  const title = await boxOf(table.getByRole("columnheader", { name: "Title", exact: true }));
  const format = await boxOf(table.getByRole("columnheader", { name: "Format", exact: true }));
  const quality = await boxOf(table.getByRole("columnheader", { name: "Quality", exact: true }));
  const time = await boxOf(table.getByRole("columnheader", { name: "Time", exact: true }));

  expect(number.width).toBeLessThan(title.width / 4);
  expect(title.width).toBeGreaterThan(format.width);
  expect(title.width).toBeGreaterThan(quality.width);
  expect(title.width).toBeGreaterThan(time.width);
});
