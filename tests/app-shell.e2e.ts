import { expect, test } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

test.beforeEach(async ({ page }) => installNativeApi(page));

test("navigates between the three library presentations and Settings", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/library\/albums(?:\?|$)/);

  for (const [label, path] of [
    ["Albums", "/library/albums"],
    ["Album Artists", "/library/album-artists"],
    ["Tracks", "/library/tracks"],
    ["Settings", "/settings"],
  ] as const) {
    const link = page.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:\\?|$)`));
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("main")).toBeVisible();
  }

  await expect(page.getByText("Local listening desk")).toHaveCount(0);
  await expect(page.getByText("Local library", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Native audio engine", { exact: true })).toHaveCount(0);
});

test("keeps search and navigation interaction states visually distinct", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/library/albums");

  const albums = page.getByRole("link", { name: "Albums", exact: true });
  const albumArtists = page.getByRole("link", { name: "Album Artists", exact: true });
  const background = (locator: typeof albums) =>
    locator.evaluate((element) => getComputedStyle(element).backgroundColor);

  const restBackground = await background(albumArtists);
  const selectedBackground = await background(albums);
  expect(selectedBackground).not.toBe(restBackground);

  await albumArtists.hover();
  const hoverBackground = await background(albumArtists);
  expect(hoverBackground).not.toBe(restBackground);
  expect(hoverBackground).not.toBe(selectedBackground);

  await albums.focus();
  await page.keyboard.press("Tab");
  await expect(albumArtists).toBeFocused();
  const focusShadow = await albumArtists.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(focusShadow).not.toBe("none");

  const search = page.getByRole("searchbox", { name: "Search albums" });
  const searchGroup = page.locator('[data-slot="input-group"]').filter({ has: search });
  const addon = searchGroup.locator('[data-slot="input-group-addon"]');
  const searchGroupBox = await searchGroup.boundingBox();
  const addonBox = await addon.boundingBox();
  const searchBox = await search.boundingBox();
  expect(searchGroupBox).not.toBeNull();
  expect(addonBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(addonBox!.x).toBeGreaterThanOrEqual(searchGroupBox!.x);
  expect(addonBox!.x + addonBox!.width).toBeLessThanOrEqual(searchBox!.x + 1);

  const inputStyle = await search.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderWidth: style.borderTopWidth,
      paddingLeft: Number.parseFloat(style.paddingLeft),
    };
  });
  expect(inputStyle.borderWidth).toBe("0px");
  expect(inputStyle.paddingLeft).toBeGreaterThanOrEqual(6);

  await search.focus();
  const groupFocusStyle = await searchGroup.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderColor: style.borderColor, boxShadow: style.boxShadow };
  });
  expect(groupFocusStyle.boxShadow).not.toBe("none");
});

for (const width of [640, 767, 768, 1024, 1360, 1920]) {
  test(`keeps navigation and playback inside a ${width}px window`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/library/albums");
    await expect(page.getByRole("main")).toBeVisible();
    const dock = page.getByRole("contentinfo", { name: "Playback controls" });
    await expect(dock).toBeVisible();
    const volume = page.getByRole("slider", { name: "Volume" }).last();
    await expect(volume).toBeVisible();
    const mute = page.getByRole("button", { name: "Mute", exact: true });
    await expect(mute).toBeVisible();

    const dockBox = await dock.boundingBox();
    const statusBox = await page.locator('[data-slot="playback-status"]').boundingBox();
    const seekTrackBox = await dock
      .locator('[data-region="seek"] [data-slot="slider-track"]')
      .boundingBox();
    const volumeTrackBox = await dock
      .locator('[data-region="volume-slider"] [data-slot="slider-track"]')
      .boundingBox();
    const artworkBox = await dock.locator('[data-slot="artwork"]').boundingBox();
    const transportBox = await dock.locator('[data-region="playback-core"]').boundingBox();
    const muteBox = await mute.boundingBox();

    expect(dockBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(seekTrackBox).not.toBeNull();
    expect(volumeTrackBox).not.toBeNull();
    expect(artworkBox).not.toBeNull();
    expect(transportBox).not.toBeNull();
    expect(muteBox).not.toBeNull();

    expect(dockBox!.height).toBeCloseTo(64, 0);
    expect(statusBox!.height).toBeCloseTo(24, 0);
    expect(dockBox!.height + statusBox!.height).toBeCloseTo(88, 0);
    expect(volumeTrackBox!.width).toBeGreaterThan(80);
    expect(Math.abs(seekTrackBox!.x - dockBox!.x)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(seekTrackBox!.x + seekTrackBox!.width - (dockBox!.x + dockBox!.width)),
    ).toBeLessThanOrEqual(1);

    const artworkTopGap = artworkBox!.y - dockBox!.y;
    const artworkBottomGap = dockBox!.y + dockBox!.height - (artworkBox!.y + artworkBox!.height);
    expect(Math.abs(artworkTopGap - artworkBottomGap)).toBeLessThanOrEqual(1);

    const dockCenter = dockBox!.y + dockBox!.height / 2;
    const transportCenter = transportBox!.y + transportBox!.height / 2;
    expect(Math.abs(dockCenter - transportCenter)).toBeLessThanOrEqual(1);
    expect(muteBox!.width).toBeGreaterThanOrEqual(36);
    expect(muteBox!.height).toBeGreaterThanOrEqual(36);

    const navigation = page.getByRole("navigation", { name: "Application" });
    const trigger = page.getByRole("button", { name: "Open navigation" });

    if (width < 768) {
      await expect(trigger).toBeVisible();
      const triggerBox = await trigger.boundingBox();
      expect(triggerBox).not.toBeNull();
      expect(triggerBox!.width).toBeGreaterThanOrEqual(36);
      expect(triggerBox!.height).toBeGreaterThanOrEqual(36);
      await trigger.click();
      await expect(navigation).toBeVisible();
      await expect(page.getByRole("button", { name: "Close navigation" })).toBeVisible();
      await expect(navigation.getByRole("link", { name: "Albums", exact: true })).toBeVisible();
      const settings = navigation.getByRole("link", { name: "Settings", exact: true });
      await expect(settings).toBeVisible();
      await settings.click();
      await expect(page).toHaveURL(/\/settings(?:\?|$)/);
      await expect(navigation).toBeHidden();
    } else {
      await expect(trigger).toBeHidden();
      await expect(navigation).toBeVisible();
      const navigationBox = await navigation.boundingBox();
      expect(navigationBox?.width).toBe(256);
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });
}
