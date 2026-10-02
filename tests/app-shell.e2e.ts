import { expect, test } from "./fixtures/test";

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
  // The selection is a pill behind the link's content (it slides between items).
  const selectedBackground = await background(albums.locator(':scope > span[aria-hidden="true"]'));
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
    const seekBox = await dock.locator('[data-region="seek"]').boundingBox();
    const volumeTrackBox = await dock
      .locator('[data-region="volume-slider"] [data-slot="slider-track"]')
      .boundingBox();
    const sleeveBox = await dock.locator('[data-slot="sleeve"]').boundingBox();
    const transportBox = await dock.locator('[data-region="playback-core"]').boundingBox();
    const iconRowBox = await dock.locator('[data-region="volume"]').boundingBox();
    const muteBox = await mute.boundingBox();

    expect(dockBox).not.toBeNull();
    expect(seekBox).not.toBeNull();
    expect(volumeTrackBox).not.toBeNull();
    expect(sleeveBox).not.toBeNull();
    expect(transportBox).not.toBeNull();
    expect(iconRowBox).not.toBeNull();
    expect(muteBox).not.toBeNull();

    // A single 104px dock; the signal path hangs inside it under the volume controls.
    expect(dockBox!.height).toBeCloseTo(104, 0);
    expect(volumeTrackBox!.width).toBeGreaterThan(80);
    expect(seekBox!.height).toBeCloseTo(6, 0);
    if (width >= 768) {
      // The elapsed/remaining labels sit inline beside the bar (not stacked below it), so the
      // bar itself is inset from both dock edges by roughly a label's width, not edge to edge.
      expect(seekBox!.x - dockBox!.x).toBeGreaterThan(24);
      expect(dockBox!.x + dockBox!.width - (seekBox!.x + seekBox!.width)).toBeGreaterThan(24);
    } else {
      // Below md the labels are hidden entirely, so the bar alone fills the row, inset only by
      // the row's own horizontal padding (`px-2`).
      expect(seekBox!.x - dockBox!.x).toBeGreaterThanOrEqual(4);
      expect(seekBox!.x - dockBox!.x).toBeLessThanOrEqual(12);
      expect(
        Math.abs(dockBox!.x + dockBox!.width - (seekBox!.x + seekBox!.width)),
      ).toBeLessThanOrEqual(12);
    }

    // The Sleeve is a fixed, inset tile beside the title/artist — never edge-filling, and its
    // size doesn't change with width. The signal path sits inside the dock, right-aligned under
    // the volume row.
    const signalPath = page.getByRole("group", { name: "Signal path" });
    expect(sleeveBox!.width).toBeCloseTo(64, 0);
    expect(sleeveBox!.height).toBeCloseTo(64, 0);
    expect(sleeveBox!.x).toBeGreaterThan(dockBox!.x);
    if (width >= 768) {
      await expect(dock.getByRole("button", { name: "Shuffle" })).toBeVisible();
      await expect(dock.getByRole("button", { name: /^Repeat/ })).toBeVisible();
      await expect(signalPath).toBeVisible();
      const signalPathBox = await signalPath.boundingBox();
      expect(signalPathBox).not.toBeNull();
      expect(signalPathBox!.y + signalPathBox!.height).toBeLessThanOrEqual(
        dockBox!.y + dockBox!.height,
      );
      expect(
        Math.abs(signalPathBox!.x + signalPathBox!.width - (dockBox!.x + dockBox!.width)),
      ).toBeLessThanOrEqual(24);
    } else {
      await expect(dock.getByRole("button", { name: "Shuffle" })).toBeHidden();
      await expect(dock.getByRole("button", { name: /^Repeat/ })).toBeHidden();
      await expect(signalPath).toBeHidden();
    }

    // Transport buttons and the lyrics/queue/volume icon row share one baseline (the primary
    // row); the signal path sits on its own row below the icons, so it must not pull that
    // shared baseline off-center the way one undivided, independently-centered column did.
    const transportCenter = transportBox!.y + transportBox!.height / 2;
    const iconRowCenter = iconRowBox!.y + iconRowBox!.height / 2;
    expect(Math.abs(transportCenter - iconRowCenter)).toBeLessThanOrEqual(1);

    // The transport grid's two side columns are equal width, so the transport controls land on
    // the dock's true horizontal center regardless of how wide the identity block or volume
    // controls are on either side — not just centered in the space left over after the Sleeve.
    const transportHCenter = transportBox!.x + transportBox!.width / 2;
    const dockHCenter = dockBox!.x + dockBox!.width / 2;
    expect(Math.abs(transportHCenter - dockHCenter)).toBeLessThanOrEqual(2);

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
