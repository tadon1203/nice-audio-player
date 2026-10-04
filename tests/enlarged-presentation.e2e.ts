import { expect, test } from "./fixtures/test";
import { stoppedPlayback, testLibrary } from "./fixtures/data";

for (const width of [640, 1360]) {
  test(`Settings and floating actions remain available with 200% text at ${width}px`, async ({
    page,
    native,
  }) => {
    native.respond("setAudioOutputSelection", ({ selection }) => ({
      ...stoppedPlayback,
      base: { ...stoppedPlayback.base, revision: 50, outputSelection: selection },
    }));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/settings");
    await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
    const remove = page.getByRole("button", { name: "Remove C:/Music from library" });
    await remove.scrollIntoViewIfNeeded();
    const before = await remove.evaluate((element) => ({
      size: getComputedStyle(element).fontSize,
      weight: getComputedStyle(element).fontWeight,
    }));
    expect(parseFloat(before.size)).toBeGreaterThanOrEqual(28);
    expect(["400", "500"]).toContain(before.weight);
    await remove.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole("button", { name: "Cancel" });
    const box = (await cancel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await cancel.click();
    await expect(remove).toBeFocused();
    const select = page
      .getByRole("region", { name: "Playback", exact: true })
      .getByRole("button", { name: /Output device:/ });
    await select.click();
    await page.getByRole("option", { name: "Headphones", exact: true }).click();
    await select.click();
    await expect(page.getByRole("option", { name: "Headphones", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(select).toBeFocused();
  });
}

test.describe("long Japanese identity", () => {
  const japaneseLibrary = testLibrary();
  japaneseLibrary.tracks[0]!.title = "日本語のとても長い曲名が続いても操作できる音楽プレイヤー";
  test.use({ library: japaneseLibrary });
  test("retains controls and stable weight across playback states", async ({ page, library }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto("/library/tracks");
    const play = page.getByRole("button", { name: `Play ${library.tracks[0]!.title}` });
    await play.click();
    const dock = page.getByRole("contentinfo", { name: "Playback controls" });
    const identity = dock.getByRole("button", { name: library.tracks[0]!.title, exact: true });
    const weight = await identity.evaluate((element) => getComputedStyle(element).fontWeight);
    await dock.getByRole("button", { name: "Pause", exact: true }).click();
    expect(await identity.evaluate((element) => getComputedStyle(element).fontWeight)).toBe(weight);
    await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
    await dock.getByRole("button", { name: "Open Now Playing" }).click();
    await expect(page.getByRole("region", { name: "Now Playing" })).toBeVisible();
    await expect(dock.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
    await dock.getByRole("button", { name: "Resume", exact: true }).click();
  });
});
