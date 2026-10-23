import type { LibraryDirectory, ScanStatus } from "#lib/native";
import { pageOf, scanSnapshot, testDirectory } from "./fixtures/data";
import type { Native } from "./fixtures/native-api";
import { expect, test } from "./fixtures/test";

let scansEnded = 0;

/**
 * The scan is in `state`: what the renderer reads now, and the event that announces it. Every
 * scan that ends has ended one more than the last and changed something, as a real one would.
 */
async function publishScan(native: Native, state: ScanStatus): Promise<void> {
  if (state !== "running" && state !== "idle") scansEnded += 1;
  const snapshot = {
    ...scanSnapshot(state),
    finishedCount: scansEnded,
    changedCount: scansEnded * 20,
  };
  await native.publish("libraryScan", snapshot);
}
import { workspaceViewport } from "./fixtures/locators";

test("keeps each library filter and sort when switching peers and visiting Settings", async ({
  page,
  native,
  library,
}) => {
  native.respond("libraryListAlbums", ({ request: { search } }) =>
    pageOf(search === "Test album" ? [library.albums[0]!] : library.albums, null, 100),
  );
  await page.goto("/library/albums");
  let filter = page.getByRole("searchbox", { name: "Search albums" });
  await filter.fill("Test album");
  await expect(page.getByText("1 album", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Sort albums" }).click();
  await page.getByRole("option", { name: "Year", exact: true }).click();
  await page.getByRole("button", { name: "Sort descending" }).click();

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

  await expect(page.getByRole("combobox", { name: "Sort albums" })).toHaveText("Year");
  await expect(page.getByRole("button", { name: "Sort ascending" })).toBeVisible();
});

test("returns from an album to its semantic artist parent", async ({ page }) => {
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();
  await expect(page.getByRole("heading", { name: "Test artist" })).toBeVisible();
  await page.getByRole("link", { name: "Open album Test album" }).click();
  await expect(page.getByRole("heading", { name: "Test album" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tracks", level: 2 })).toBeVisible();
  await page.getByRole("link", { name: "Test artist", exact: true }).click();
  await expect(page).toHaveURL(/\/library\/album-artists\/[0-9a-f]{32}$/);
  await expect(page.getByRole("heading", { name: "Test artist" })).toBeVisible();
});

test("returns from an album to its ID artist page after the album page reloads", async ({
  page,
}) => {
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();
  await page.getByRole("link", { name: "Open album Test album" }).click();
  await expect(page.getByRole("heading", { name: "Test album" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Test album" })).toBeVisible();
  await page.getByRole("link", { name: "Test artist", exact: true }).click();
  await expect(page).toHaveURL(/\/library\/album-artists\/[0-9a-f]{32}$/);
  await expect(page.getByRole("heading", { name: "Test artist" })).toBeVisible();
});

test("keeps an album's ID route after a reload", async ({ page }) => {
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  await expect(page.getByRole("heading", { name: "Test album" })).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Test album" })).toBeVisible();
});

test("keeps an album artist's ID route after a reload", async ({ page }) => {
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();
  await expect(page.getByRole("heading", { name: "Test artist" })).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Test artist" })).toBeVisible();
});

test("shows an album's title before its details arrive, opened from a tile", async ({
  page,
  native,
  library,
}) => {
  let release = (): void => {};
  const details = new Promise<void>((resolve) => (release = resolve));
  native.respond("libraryAlbum", async () => {
    await details;
    return library.albumDetails;
  });
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  await expect(page.getByRole("heading", { name: "Test album" })).toBeVisible();
  await expect(page.getByText("Reading album…")).toBeVisible();
  release();
  await expect(page.getByText("Reading album…")).toHaveCount(0);
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
  await expect(table.getByRole("columnheader", { name: "Title" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  // Reaching the end of the list loads every next page by itself. Wait for the last row, the one
  // state that stays: a row in the middle is rendered only while the list ends right there.
  const viewport = workspaceViewport(page);
  await expect
    .poll(async () => {
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      return table.getByRole("row", { name: /Track 140/ }).count();
    })
    .toBe(1);
});

test("restores the virtual track container after switching library presentations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/library/tracks");
  const scrollRegion = workspaceViewport(page);
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

test("manages directories and shows scan progress and terminal states", async ({
  page,
  native,
}) => {
  const added: LibraryDirectory = { ...testDirectory, id: 2, path: "C:/More Music" };
  let directories = [testDirectory];
  native.respond("libraryListDirectories", () => directories);
  native.respond("libraryAddDirectory", () => {
    directories = [...directories, added];
    return added;
  });
  native.respond("librarySetDirectoryEnabled", ({ id, enabled }) => {
    directories = directories.map((directory) =>
      directory.id === id ? { ...directory, enabled } : directory,
    );
    return directories.find((directory) => directory.id === id)!;
  });
  native.respond("libraryRemoveDirectory", ({ id }) => {
    directories = directories.filter((directory) => directory.id !== id);
    return null;
  });
  native.respond("libraryStartScan", async () => {
    await publishScan(native, "running");
    return null;
  });
  native.respond("libraryCancelScan", async () => {
    await publishScan(native, "cancelled");
    return null;
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Add directory" }).click();
  await expect(page.getByTitle("C:/More Music", { exact: true })).toBeVisible();

  const include = page.getByRole("checkbox", { name: /Include C:\/Music in library/ }).first();
  const musicRow = page.getByRole("listitem").filter({ hasText: /^C:\/Music(?!\/)/ });
  await include.click();
  await expect(include).not.toBeChecked();
  await expect(musicRow.getByText("Excluded from library")).toBeVisible();
  await include.click();
  await expect(include).toBeChecked();
  await expect(musicRow.getByText("Included in library")).toBeVisible();

  await page.getByRole("button", { name: "Rescan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Scanning");
  await expect(page.getByRole("progressbar", { name: "Scan progress" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel scan" }).click();
  await expect(page.getByRole("status")).toContainText("Scan cancelled");

  await publishScan(native, "completed");
  await expect(page.getByText(/20 discovered, 20 inspected, 18 indexed, 0 failed/)).toBeVisible();
  await publishScan(native, "failed");
  await expect(page.getByRole("alert")).toContainText("A library directory could not be read.");

  await page.getByRole("button", { name: "Remove C:/More Music from library" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("C:/More Music");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Remove C:/More Music from library" }).click();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByTitle("C:/More Music", { exact: true })).toHaveCount(0);
});

test("invalidates mounted library queries after terminal scan events and directory changes", async ({
  page,
  native,
  library,
}) => {
  let directories = [testDirectory];
  native.respond("libraryListDirectories", () => directories);
  native.respond("librarySetDirectoryEnabled", ({ id, enabled }) => {
    directories = directories.map((directory) =>
      directory.id === id ? { ...directory, enabled } : directory,
    );
    return directories.find((directory) => directory.id === id)!;
  });
  native.respond("libraryListTracks", ({ request: { cursor } }) =>
    pageOf(directories.some((directory) => directory.enabled) ? library.tracks : [], cursor),
  );
  await page.goto("/library/tracks");
  const getCount = (): number => native.callsTo("libraryListTracks").length;
  await expect.poll(getCount).toBeGreaterThan(0);

  let requestCount = getCount();
  await publishScan(native, "completed");
  await expect.poll(getCount).toBeGreaterThan(requestCount);
  requestCount = getCount();
  await publishScan(native, "cancelled");
  await expect.poll(getCount).toBeGreaterThan(requestCount);
  requestCount = getCount();
  await publishScan(native, "failed");
  await expect.poll(getCount).toBeGreaterThan(requestCount);

  requestCount = getCount();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  // The checkbox is controlled by the saved setting, so it flips after the round trip; assert on
  // that instead of `uncheck()`, which expects the state to change synchronously.
  const includeDirectory = page
    .getByRole("checkbox", { name: /Include C:\/Music in library/ })
    .first();
  await includeDirectory.click();
  await expect(includeDirectory).not.toBeChecked();
  await page.getByRole("link", { name: "Tracks", exact: true }).click();
  await expect.poll(getCount).toBeGreaterThan(requestCount);
  await expect(page.getByText("0 tracks", { exact: true })).toBeVisible();
});
