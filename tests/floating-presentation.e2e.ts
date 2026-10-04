import { expect, test } from "./fixtures/test";
import type { Locator } from "@playwright/test";

async function floatingPresentation(surface: Locator, forcedColors = false) {
  await expect(surface).toBeVisible();
  const actual = await surface.evaluate((element) => {
    const style = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    probe.style.transitionTimingFunction = "var(--motion-easing)";
    document.body.append(probe);
    const expectedEasing = getComputedStyle(probe).transitionTimingFunction;
    probe.remove();
    return {
      blur: style.backdropFilter,
      shadow: style.boxShadow,
      duration: style.transitionDuration,
      expectedDuration: `${parseFloat(root.getPropertyValue("--motion-move-duration")) / 1000}s`,
      easing: style.transitionTimingFunction,
      expectedEasing,
      fontSize: parseFloat(style.fontSize),
    };
  });
  if (forcedColors) expect(actual.blur).toBe("none");
  else {
    expect(actual.blur).toContain("blur");
    expect(actual.shadow).not.toBe("none");
  }
  expect(actual.fontSize).toBeGreaterThanOrEqual(14);
  expect(actual.duration).toBe(actual.expectedDuration);
  expect(actual.easing).toBe(actual.expectedEasing);
}

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`nested popups remain operable above a confirmation with ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("http://127.0.0.1:5174");
    const trigger = page.getByRole("button", { name: "Open confirmation" });
    await trigger.click();
    const dialog = page.getByRole("alertdialog");
    await floatingPresentation(dialog);
    const selection = dialog.getByRole("combobox", { name: "Nested selection" });
    await selection.click();
    await floatingPresentation(page.locator('[data-slot="select-content"]'));
    await page.getByRole("option", { name: "Second", exact: true }).click();
    await expect(selection).toHaveText("second");
    await dialog.getByRole("button", { name: "Nested menu" }).click();
    await floatingPresentation(page.getByRole("menu"));
    await page.getByRole("menuitemradio", { name: "Second command" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Help" }).hover();
    await floatingPresentation(page.locator('[data-slot="tooltip-content"]'));
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(trigger).toBeFocused();
  });
}

test("real task panels, menus and folded navigation use their owned surfaces", async ({ page }) => {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await dock.getByRole("button", { name: "Open Now Playing" }).click({ button: "right" });
  await floatingPresentation(page.getByRole("menu"));
  await page.keyboard.press("Escape");
  await dock.getByRole("button", { name: /Output device:/ }).click();
  await floatingPresentation(page.getByRole("menu"));
  await page.keyboard.press("Escape");
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const queue = page.getByRole("dialog", { name: "Queue" });
  await floatingPresentation(queue);
  await page.getByRole("row").filter({ hasText: "Test track" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Properties" }).click();
  await floatingPresentation(page.getByRole("dialog", { name: "Properties" }));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 600, height: 900 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("dialog", { name: "Nice Audio Player" });
  const style = await navigation.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    sidebar: getComputedStyle(document.querySelector("aside")!).backgroundColor,
    blur: getComputedStyle(element).backdropFilter,
  }));
  expect(style.background).toBe(style.sidebar);
  expect(style.blur).toBe("none");
});

test("forced colors preserve actual dialog and selection surfaces", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "Open confirmation" }).click();
  await floatingPresentation(page.getByRole("alertdialog"), true);
  await page.getByRole("combobox", { name: "Nested selection" }).click();
  await floatingPresentation(page.locator('[data-slot="select-content"]'), true);
  await page.getByRole("option", { name: "Second", exact: true }).click();
});

test("a real popup remains above the Sleeve during flight", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  await page.goto("/library/albums");
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const flight = document.querySelector('[data-shared-element="flying"]');
      if (!flight) return;
      for (const animation of flight.getAnimations()) animation.pause();
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true });
  });
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  const flight = page.locator('[data-shared-element="flying"]');
  await expect(flight).toBeVisible();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await dock.getByRole("button", { name: /Output device:/ }).click();
  const popup = page.getByRole("menu");
  await expect(popup).toBeVisible();
  const flightLayer = await flight.evaluate((element) => Number(getComputedStyle(element).zIndex));
  const popupLayer = await popup.evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(popupLayer).toBeGreaterThan(flightLayer);
  await popup.getByRole("menuitemradio").first().click();
  await expect(popup).not.toBeVisible();
});
