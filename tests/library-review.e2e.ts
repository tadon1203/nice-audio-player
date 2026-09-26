import { expect, test } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

test.beforeEach(async ({ page }) => installNativeApi(page));

test("keeps each library filter and sort when switching peers and visiting Settings", async ({
  page,
}) => {
  await page.goto("/library/albums");
  let filter = page.getByRole("searchbox", { name: "Search albums" });
  await filter.fill("Test album");
  await expect(page.getByText("1 album", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/library\/albums\?/);
  await page.getByRole("combobox", { name: "Sort albums" }).click();
  await page.getByRole("option", { name: "Year", exact: true }).click();
  await page.getByRole("button", { name: "Sort descending" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("albumsFilter")).toBe("Test album");

  await page.getByRole("link", { name: "Album Artists", exact: true }).click();
  filter = page.getByRole("searchbox", { name: "Search album artists" });
  await filter.fill("Test artist");
  await page.getByRole("combobox", { name: "Sort album artists" }).click();
  await page.getByRole("option", { name: "Track count", exact: true }).click();
  await page.getByRole("button", { name: "Sort descending" }).click();

  await page.getByRole("link", { name: "Tracks", exact: true }).click();
  filter = page.getByRole("searchbox", { name: "Search tracks" });
  await filter.fill("Test track");
  await page.getByRole("button", { name: "Sort by Title", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("tracksFilter")).toBe("Test track");

  await page
    .getByRole("navigation", { name: "Application" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("link", { name: "Tracks", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Search tracks" })).toHaveValue("Test track");
  await page.getByRole("link", { name: "Album Artists", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Search album artists" })).toHaveValue(
    "Test artist",
  );
  await page
    .getByRole("navigation", { name: "Application" })
    .getByRole("link", { name: "Albums", exact: true })
    .click();
  await expect(page.getByRole("searchbox", { name: "Search albums" })).toHaveValue("Test album");

  const params = new URL(page.url()).searchParams;
  expect(params.get("albumsSort")).toBe("year");
  expect(params.get("albumsDirection")).toBe("descending");
  expect(params.get("artistsSort")).toBe("trackCount");
  expect(params.get("artistsDirection")).toBe("descending");
  expect(params.get("tracksFilter")).toBe("Test track");
  expect(params.get("tracksSort")).toBe("title");
});

test("returns from an album to its semantic artist parent", async ({ page }) => {
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();
  await expect(page.getByRole("heading", { name: "Test artist" })).toBeVisible();
  await page.getByRole("link", { name: "Open album Test album" }).click();
  await expect(page.getByRole("heading", { name: "Test album" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tracks", level: 2 })).toBeVisible();
  await page.getByRole("link", { name: "Test artist", exact: true }).click();
  await expect(page).toHaveURL(/\/library\/album-artists\/Test%20artist/);
  await expect(page.getByRole("heading", { name: "Test artist" })).toBeVisible();
});

test("returns from an album opened from Albums to the Albums presentation", async ({ page }) => {
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  await expect(page.getByRole("heading", { name: "Test album" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tracks", level: 2 })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Application" })
    .getByRole("link", { name: "Albums", exact: true })
    .click();
  await expect(page).toHaveURL(/\/library\/albums/);
  await expect(page.getByRole("heading", { name: "Albums" })).toBeVisible();
});

test("sorts tracks, disables missing files, and loads more rows", async ({ page }) => {
  await page.goto("/library/tracks");
  const table = page.getByRole("table", { name: "Library tracks" });
  await expect(table.getByRole("row", { name: /Missing track/ })).toBeVisible();
  await expect(table.getByRole("button", { name: "Play Missing track" })).toBeDisabled();
  await expect(page.getByText("140 tracks", { exact: true })).toBeVisible();

  const titleHeader = table.getByRole("button", { name: "Sort by Title", exact: true });
  await titleHeader.click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("tracksDirection"))
    .toBe("descending");
  await expect(page).toHaveURL(/\/library\/tracks\?/);
  await expect(table.getByRole("columnheader", { name: "Title" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  await page.getByRole("button", { name: "Load more" }).click();
  await page.locator('[data-slot="scroll-area-viewport"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(table.getByRole("row", { name: /Track 080/ })).toBeVisible();
});

test("restores the virtual track container after switching library presentations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Load more" }).click();
  await page.getByRole("button", { name: "Load more" }).click();
  const scrollRegion = page.locator('[data-scroll-restoration-id="library-tracks"]');
  await scrollRegion.evaluate((element) => {
    element.scrollTop = 1_600;
  });
  await expect
    .poll(() => scrollRegion.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1_000);

  await page.getByRole("link", { name: "Albums", exact: true }).click();
  await page.getByRole("link", { name: "Tracks", exact: true }).click();
  await expect
    .poll(() => scrollRegion.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1_000);
});

test("manages folders and shows scan progress and terminal states", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Add folder" }).click();
  await expect(page.getByText("C:/More Music", { exact: true })).toBeVisible();

  const include = page.getByRole("checkbox", { name: /Include C:\/Music in library/ }).first();
  const musicRow = page.getByRole("listitem").filter({ hasText: /^C:\/Music(?!\/)/ });
  await include.click();
  await expect(include).not.toBeChecked();
  await expect(musicRow.getByText("Excluded from library")).toBeVisible();
  await include.click();
  await expect(include).toBeChecked();
  await expect(musicRow.getByText("Included in library")).toBeVisible();

  await page.getByRole("button", { name: "Rescan" }).click();
  await expect(page.getByRole("status")).toContainText("Scanning");
  await expect(page.getByRole("progressbar", { name: "Scan progress" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel scan" }).click();
  await expect(page.getByRole("status")).toContainText("Scan cancelled");

  await page.evaluate(() => window.__niceAudioPlayerTest?.setScanState("completed"));
  await expect(
    page.getByText(/Scan complete: 20 discovered, 20 inspected, 18 indexed, 0 failed/),
  ).toBeVisible();
  await page.evaluate(() => window.__niceAudioPlayerTest?.setScanState("failed"));
  await expect(page.getByRole("alert")).toContainText(
    "Scan failed: a library folder could not be read.",
  );

  await page.getByRole("button", { name: "Remove C:/More Music from library" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("C:/More Music");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Remove C:/More Music from library" }).click();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("C:/More Music", { exact: true })).toHaveCount(0);
});

test("invalidates mounted library queries after terminal scan events and root changes", async ({
  page,
}) => {
  await page.goto("/library/tracks");
  const getCount = () =>
    page.evaluate(() => window.__niceAudioPlayerTest?.getRequestCount("tracks") ?? 0);
  await expect.poll(getCount).toBeGreaterThan(0);

  let requestCount = await getCount();
  await page.evaluate(() => window.__niceAudioPlayerTest?.setScanState("completed"));
  await expect.poll(getCount).toBeGreaterThan(requestCount);
  requestCount = await getCount();
  await page.evaluate(() => window.__niceAudioPlayerTest?.setScanState("cancelled"));
  await expect.poll(getCount).toBeGreaterThan(requestCount);
  requestCount = await getCount();
  await page.evaluate(() => window.__niceAudioPlayerTest?.setScanState("failed"));
  await expect.poll(getCount).toBeGreaterThan(requestCount);

  requestCount = await getCount();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Include C:\/Music in library/ })
    .first()
    .uncheck();
  await page.getByRole("link", { name: "Tracks", exact: true }).click();
  await expect.poll(getCount).toBeGreaterThan(requestCount);
  await expect(page.getByText("0 tracks", { exact: true })).toBeVisible();
});
