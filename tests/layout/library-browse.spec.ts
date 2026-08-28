import { expect, test } from "@playwright/test";
import { openFixture } from "./helpers";

test("library browse keeps peer presentations and hierarchical navigation interactive", async ({
  page,
}) => {
  await openFixture(page, "library-browse", { width: 800, height: 600 });
  await expect(page.getByRole("button", { name: "Albums" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const browserSurface = page.locator('[data-library-surface="browser"]').last();
  const albumGrid = page.locator(".library-view__album-grid");
  await expect(albumGrid.locator(":scope > article > button")).toHaveCount(100);
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => albumGrid.locator(":scope > article > button").count())
    .toBeGreaterThan(100);
  const albumSearch = page.getByRole("textbox", { name: "Filter albums" });
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await albumSearch.fill("Case");
  await expect(albumGrid.locator(":scope > article > button")).toHaveCount(2);
  await expect.poll(() => browserSurface.evaluate((element) => element.scrollTop)).toBe(0);
  await albumSearch.fill("");
  await expect(page.getByRole("button", { name: /Open A Very Long Album Title/ })).toBeVisible();
  await expect(albumGrid.locator(":scope > article > button")).toHaveCount(100);
  const browserSurfaceBox = await browserSurface.boundingBox();
  if (!browserSurfaceBox) throw new Error("Library browser surface is not measurable");
  await page.mouse.move(
    browserSurfaceBox.x + browserSurfaceBox.width / 2,
    browserSurfaceBox.y + browserSurfaceBox.height - 24,
  );
  await page.mouse.wheel(0, 320);
  await expect
    .poll(() => browserSurface.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const albumsScrollTop = await browserSurface.evaluate((element) => element.scrollTop);

  await page.getByRole("button", { name: "Album Artists" }).evaluate((button) => button.click());
  await expect(page.getByRole("region", { name: "Album artists" })).toBeVisible();
  const artistGrid = page.locator('[aria-label="Album artists"] .library-view__album-grid');
  await expect(artistGrid.locator(":scope > button")).toHaveCount(100);
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => artistGrid.locator(":scope > button").count()).toBeGreaterThan(100);
  await page.getByRole("button", { name: /Fixture Artist/ }).click();
  await expect(
    page.getByRole("region", { name: /Fixture Artist album artist detail/ }),
  ).toBeVisible();
  const artistAlbumGrid = page.locator(".album-detail .library-view__album-grid");
  await expect(artistAlbumGrid.locator(":scope > article > button")).toHaveCount(100);
  await page
    .locator('[data-library-surface="artist-detail"]')
    .last()
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  await expect
    .poll(() => artistAlbumGrid.locator(":scope > article > button").count())
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("region", { name: "Album artists" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Fixture Artist" })).toBeFocused();

  await page.getByRole("button", { name: "Tracks" }).click();
  await expect(page.getByRole("heading", { name: "Tracks" })).toBeVisible();
  await expect(page.locator('.library-view__tracks [data-index="0"]')).toBeVisible();
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => page.locator('.library-view__tracks [data-index="100"]').count()).toBe(1);
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => page.locator('.library-view__tracks [data-index="129"]').count()).toBe(1);
  await page.getByRole("button", { name: "Albums" }).click();
  await expect(page.getByRole("region", { name: "Albums" })).toBeVisible();
  const albumsSurface = page.locator(
    '.exclusive-region__contents[data-state="present"] [data-library-surface="browser"]:has([data-presentation="albums"])',
  );
  await expect
    .poll(() => albumsSurface.evaluate((element) => element.scrollTop))
    .toBe(albumsScrollTop);
  const albumButton = page.getByRole("button", { name: /Open A Very Long Album Title/ });
  await albumButton.evaluate((button) => {
    button.focus({ preventScroll: true });
    button.click();
  });
  await expect(page.getByRole("region", { name: /album detail/ })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("region", { name: "Albums" })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(
          '.exclusive-region__contents[data-state="exiting"] [data-library-surface="detail"]',
        )
        .count(),
    )
    .toBe(0);
  await expect
    .poll(() => albumsSurface.evaluate((element) => element.scrollTop))
    .toBe(albumsScrollTop);
  await expect(albumButton).toBeFocused();
  await albumButton.evaluate((button) => button.click());
  await expect(page.getByRole("region", { name: /album detail/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await page.getByRole("button", { name: "Fixture Artist", exact: true }).click();
  await expect(page.getByRole("region", { name: /album artist detail/ })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("region", { name: /album artist detail/ })).toBeVisible();
  await page.getByRole("button", { name: "Open A Very Long Album Title" }).click();
  await expect(page.getByRole("region", { name: /album detail/ })).toBeVisible();
  await page.getByRole("button", { name: "Fixture Artist", exact: true }).click();
  await expect(page.getByRole("region", { name: /album artist detail/ })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("region", { name: /album detail/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fixture Artist", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("region", { name: /album artist detail/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open A Very Long Album Title" })).toBeFocused();
});

test("library navigation reduced motion removes spatial movement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, "library-browse", { width: 800, height: 600 });
  await page.getByRole("button", { name: /Open A Very Long Album Title/ }).click();
  await expect(page.getByRole("region", { name: /album detail/ })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".exclusive-region__item")
        .last()
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("none");
});

test("an empty library renders the production browse surface without catalog items", async ({
  page,
}) => {
  await openFixture(page, "library-empty", { width: 800, height: 600 });
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();
  await expect(page.getByText("No indexed music yet")).toBeVisible();
  await expect(
    page.locator('[data-presentation="albums"] .library-view__album-button'),
  ).toHaveCount(0);
});

test("album and artist tiles provide pointer feedback without changing geometry", async ({
  page,
}) => {
  await openFixture(page, "library-browse", { width: 800, height: 600 });
  const album = page.locator('[data-presentation="albums"] .library-view__album-button').first();
  const albumArtwork = album.locator(".library-view__album-artwork-frame");
  const albumBox = await albumArtwork.boundingBox();
  await album.hover();
  await expect
    .poll(() => albumArtwork.evaluate((element) => getComputedStyle(element).outlineColor))
    .toBe("rgb(42, 42, 42)");
  const hoverBox = await albumArtwork.boundingBox();
  expect(hoverBox).toEqual(albumBox);
  await page.mouse.down();
  await expect
    .poll(() => albumArtwork.evaluate((element) => getComputedStyle(element).outlineColor))
    .toBe("rgb(106, 106, 106)");
  await page.mouse.move(700, 10);
  await page.mouse.up();

  await page.getByRole("button", { name: "Album Artists" }).click();
  const artist = page.locator('[aria-label="Album artists"] .library-view__album-button').first();
  const artistArtwork = artist.locator(".library-view__album-artwork-frame");
  await artist.hover();
  await expect
    .poll(() => artistArtwork.evaluate((element) => getComputedStyle(element).outlineColor))
    .toBe("rgb(42, 42, 42)");
});
