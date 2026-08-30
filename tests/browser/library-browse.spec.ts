import { expect, test } from "@playwright/test";
import { openFixture } from "./helpers";

test("Library root owns a persistent 24px header-to-content gap", async ({ page }) => {
  await openFixture(page, "library-browse", { width: 1120, height: 700 });
  const root = page.locator('[data-slot="tabs-root"]');
  await expect(root).toHaveCSS("row-gap", "24px");
  for (const tab of ["Albums", "Album Artists", "Tracks"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('[data-slot="library-header"]');
      const surface = document.querySelector('[data-library-surface="browser"]');
      if (!header || !surface) throw new Error("Library geometry is unavailable");
      return {
        gap: surface.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
        albumMargin: getComputedStyle(
          document.querySelector('[data-region="album-grid"]') ?? surface,
        ).marginBlockStart,
      };
    });
    expect(geometry.gap).toBe(24);
    if (tab !== "Tracks") expect(geometry.albumMargin).toBe("0px");
  }
});

test("Tracks inherit the Library content measure", async ({ page }) => {
  await openFixture(page, "library-browse", { width: 1440, height: 900 });
  await page.getByRole("tab", { name: "Tracks", exact: true }).click();
  const geometry = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('[data-slot="library-header-content"]');
    const tracks = document.querySelector<HTMLElement>("[data-library-layout-owner]");
    if (!header || !tracks) throw new Error("Library content measure is unavailable");
    return {
      headerLeft: header.getBoundingClientRect().left,
      headerRight: header.getBoundingClientRect().right,
      tracksLeft: tracks.getBoundingClientRect().left,
      tracksRight: tracks.getBoundingClientRect().right,
    };
  });
  expect(Math.abs(geometry.headerLeft - geometry.tracksLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.headerRight - geometry.tracksRight)).toBeLessThanOrEqual(12);
});

test("Artist artwork survives the cloned seed-to-detail summary boundary", async ({ page }) => {
  await openFixture(page, "library-browse", { width: 1120, height: 700 });
  await page.getByRole("tab", { name: "Album Artists", exact: true }).click();
  const artist = page.getByRole("button", { name: "Open Fixture Artist", exact: true });
  await expect(artist.locator('[data-slot="library-artwork"] img')).toHaveAttribute(
    "src",
    /asset.localhost/,
  );
  await artist.click();
  const hero = page.locator('[data-region="album-detail-artwork"] img');
  await expect(hero).toHaveAttribute("src", /asset.localhost/);
});

test("library browse keeps peer presentations and hierarchical navigation interactive", async ({
  page,
}) => {
  await openFixture(page, "library-browse", { width: 800, height: 600 });
  await expect(page.getByRole("tab", { name: "Albums" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Albums" })).toHaveAttribute("data-active", "");
  await page.getByRole("textbox", { name: "Filter albums" }).focus();
  await expect(page.getByRole("tab", { name: "Albums" })).toHaveAttribute("data-active", "");
  await page.getByRole("tab", { name: "Albums" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Album Artists" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Albums" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Album Artists" }).press("Enter");
  await expect(page.getByRole("tab", { name: "Album Artists" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Albums" }).click();
  const browserSurface = page.locator('[data-library-surface="browser"]').last();
  const albumGrid = page.locator('[data-region="album-grid"]');
  await expect(albumGrid.locator(":scope > article > button")).toHaveCount(100);
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(() => albumGrid.locator(":scope > article > button").count())
    .toBeGreaterThan(100);
  const albumSearch = page.getByRole("textbox", { name: "Filter albums" });
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
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

  await page.getByRole("tab", { name: "Album Artists" }).click();
  await expect(page.getByRole("region", { name: "Album artists" })).toBeVisible();
  const artistGrid = page.locator('[aria-label="Album artists"] [data-region="album-grid"]');
  await expect(artistGrid.locator(":scope > button")).toHaveCount(100);
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => artistGrid.locator(":scope > button").count()).toBeGreaterThan(100);
  await page.getByRole("button", { name: /Fixture Artist/ }).click();
  await expect(
    page.getByRole("region", { name: /Fixture Artist album artist detail/ }),
  ).toBeVisible();
  const artistAlbumGrid = page.locator(
    '[data-library-surface="artist-detail"] [data-region="album-grid"]',
  );
  await expect(artistAlbumGrid.locator(":scope > article > button")).toHaveCount(100);
  await page
    .locator('[data-library-surface="artist-detail"]')
    .last()
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
  await expect
    .poll(() => artistAlbumGrid.locator(":scope > article > button").count())
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("region", { name: "Album artists" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Fixture Artist" })).toBeFocused();

  await page.getByRole("tab", { name: "Tracks" }).click();
  await expect(page.getByRole("heading", { name: "Tracks" })).toBeVisible();
  await expect(page.getByRole("listitem").first()).toBeVisible();
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => page.locator('[data-index="100"]').count()).toBe(1);
  await browserSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => page.locator('[data-index="129"]').count()).toBe(1);
  await page.getByRole("tab", { name: "Albums" }).click();
  await expect(page.getByRole("region", { name: "Albums" })).toBeVisible();
  const albumsSurface = page.locator(
    '[data-library-surface="browser"]:has([data-presentation="albums"])',
  );
  await expect(albumsSurface).toBeVisible();
  await expect
    .poll(() => albumsSurface.evaluate((element) => element.scrollTop))
    .toBe(albumsScrollTop);
  const albumButton = page.getByRole("button", { name: /Open A Very Long Album Title/ });
  await albumButton.click();
  await expect(page.getByRole("region", { name: /album detail/ })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("region", { name: "Albums" })).toBeVisible();
  await expect.poll(() => page.locator('[data-library-surface="detail"]').count()).toBe(0);
  await expect(albumsSurface).toBeVisible();
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
        .locator('[data-library-surface="detail"]')
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
    page.locator('[data-presentation="albums"] [data-region="album-grid"] > article > button'),
  ).toHaveCount(0);
});

test("album and artist tiles provide pointer feedback without changing geometry", async ({
  page,
}) => {
  await openFixture(page, "library-browse", { width: 800, height: 600 });
  const album = page
    .locator('[data-presentation="albums"] [data-region="album-grid"] > article > button')
    .first();
  const albumArtwork = album.locator('[data-slot="album-card-artwork"]');
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

  await page.getByRole("tab", { name: "Album Artists" }).click();
  const artist = page
    .locator('[aria-label="Album artists"] [data-region="album-grid"] > button')
    .first();
  const artistArtwork = artist.locator('[data-slot="album-card-artwork"]');
  await artist.hover();
  await expect
    .poll(() => artistArtwork.evaluate((element) => getComputedStyle(element).outlineColor))
    .toBe("rgb(42, 42, 42)");
});
