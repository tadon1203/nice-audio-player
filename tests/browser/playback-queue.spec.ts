import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, openFixture } from "./helpers";

for (const viewport of [
  { width: 640, height: 800 },
  { width: 800, height: 600 },
  { width: 1120, height: 700 },
  { width: 1440, height: 900 },
]) {
  test(`Queue stays contained when open at ${viewport.width}px`, async ({ page }) => {
    await openFixture(page, "queue-open", viewport);
    const shell = page.getByTestId("app-shell");
    const contextPane = shell.locator('[data-slot="app-context-pane"]');
    const queue = page.getByTestId("playback-queue");

    await expect(queue).toBeVisible();
    await expect(contextPane.locator('[data-slot="playback-context-pane"]')).toBeVisible();
    await expect(queue.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(queue.locator('[data-slot="queue-list"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const horizontalScroll = await queue.locator('[data-slot="queue-list"]').evaluate((element) => {
      const list = element as HTMLElement;
      return {
        overflowX: getComputedStyle(list).overflowX,
      };
    });
    expect(horizontalScroll.overflowX).not.toMatch(/auto|scroll/);

    const rowContentFits = await queue.locator('[data-slot="queue-row"]').evaluateAll((rows) =>
      rows.every((row) => {
        const rowBox = row.getBoundingClientRect();
        return Array.from(row.children).every((child) => {
          const childBox = child.getBoundingClientRect();
          return childBox.left >= rowBox.left && childBox.right <= rowBox.right;
        });
      }),
    );
    expect(rowContentFits).toBe(true);

    const queueBox = await contextPane.boundingBox();
    const dockBox = await shell.locator('[data-slot="app-persistent"]').boundingBox();
    expect(queueBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(
      Math.abs((queueBox?.y ?? 0) + (queueBox?.height ?? 0) - (dockBox?.y ?? 0)),
    ).toBeLessThanOrEqual(1);

    if (viewport.width < 1440) {
      await expect(shell.locator('[data-slot="app-main"]')).toBeVisible();
      await expect(shell.locator('[data-slot="app-main"]')).toHaveAttribute("inert", "");
      await expect(shell.locator('[data-slot="app-main"]')).toHaveAttribute("aria-hidden", "true");
    } else {
      await expect(shell.locator('[data-slot="app-main"]')).toBeVisible();
      await expect(shell.locator('[data-slot="app-main"]')).not.toHaveAttribute("inert", "");
      const contextBox = await contextPane.boundingBox();
      expect(contextBox?.width).toBeGreaterThanOrEqual(360);
    }
  });
}

test("Queue close releases the context slot without authored structural CSS transition", async ({
  page,
}) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const contextPane = page.locator('[data-slot="app-context-pane"]');
  expect(
    await contextPane.evaluate((element) => getComputedStyle(element).transitionProperty),
  ).not.toContain("inline-size");
  await page
    .getByTestId("playback-queue")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(contextPane).toBeHidden();
});

for (const viewport of [
  { width: 1120, height: 700 },
  { width: 1440, height: 900 },
]) {
  test(`Queue close releases the semantic content slot before visual exit completes at ${viewport.width}px`, async ({
    page,
  }) => {
    await openFixture(page, "queue-open", viewport);
    const shell = page.getByTestId("app-shell");
    const contextPane = page.locator('[data-slot="app-context-pane"]');
    await page.getByTestId("playback-queue").getByRole("button", { name: "Close" }).click();
    await expect(shell.locator('[data-slot="app-workspace"]')).toHaveAttribute(
      "data-context-open",
      "false",
    );
    await expect(shell.locator('[data-slot="app-main"]')).toBeVisible();
    await expect(shell.locator('[data-slot="app-main"]')).not.toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name: "Open queue" })).toBeFocused();
    await expect(contextPane).toBeHidden();
  });
}

test("Queue desktop endpoint changes without grid-track CSS interpolation", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1440, height: 900 });
  const shell = page.getByTestId("app-shell");
  const workspace = shell.locator('[data-slot="app-workspace"]');
  expect(
    await workspace.evaluate((element) => getComputedStyle(element).transitionProperty),
  ).not.toContain("grid-template");

  await page.getByTestId("playback-queue").getByRole("button", { name: "Close" }).click();
  await expect(shell.locator('[data-slot="app-main"]')).toBeVisible();
});

test("the 1439/1440 breakpoint switches geometry and semantics without a correction state", async ({
  page,
}) => {
  await openFixture(page, "queue-open", { width: 1439, height: 800 });
  await expect(page.locator('[data-slot="app-main"]')).toHaveAttribute("inert", "");
  await page.setViewportSize({ width: 1440, height: 800 });
  await expect(page.locator('[data-slot="app-main"]')).not.toHaveAttribute("inert", "");
  const splitContextBox = await page.locator('[data-slot="app-context-pane"]').boundingBox();
  expect(splitContextBox?.width).toBeGreaterThanOrEqual(360);

  await page.setViewportSize({ width: 1439, height: 800 });
  await expect(page.locator('[data-slot="app-main"]')).toHaveAttribute("inert", "");
});

test("Queue preserves semantics and focus with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const shell = page.getByTestId("app-shell");

  await expect(shell.locator('[data-slot="app-main"]')).toHaveAttribute("inert", "");
  await page.getByTestId("playback-queue").getByRole("button", { name: "Close" }).click();
  await expect(shell.locator('[data-slot="app-main"]')).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Open queue" })).toBeFocused();
});

test("Queue switches to the production Lyrics pane without closing the context slot", async ({
  page,
}) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  await page.getByRole("button", { name: "Open lyrics" }).click();
  await expect(page.getByRole("heading", { name: "Lyrics" })).toBeVisible();
  await expect(page.locator("[data-cue-ordinal]")).toHaveCount(4);
  await expect(
    page.getByTestId("app-shell").locator('[data-slot="app-workspace"]'),
  ).toHaveAttribute("data-context-open", "true");
  const firstCue = page.locator("[data-cue-ordinal]").first();
  await firstCue.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-cue-ordinal="1"]')).toBeFocused();
});

test("Queue icon actions expose shared geometry and menu keyboard semantics", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const queue = page.getByTestId("playback-queue");
  for (const button of [
    page.locator('[data-slot="queue-tools"] button').nth(0),
    page.locator('[data-slot="queue-tools"] button').nth(1),
  ]) {
    await expect(button).toHaveAttribute("aria-pressed", "false");
    const box = await button.boundingBox();
    expect(box?.width).toBe(40);
    expect(box?.height).toBe(40);
  }
  const more = queue.getByRole("button", { name: /More actions for/ }).first();
  const moreBox = await more.boundingBox();
  expect(moreBox?.width).toBe(40);
  expect(moreBox?.height).toBe(40);
  await more.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Move earlier" })).toBeVisible();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Remove from queue" })).toHaveAttribute(
    "data-highlighted",
    "",
  );
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
});

test("scrollable surfaces use the dark interface scrollbar treatment", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const queueList = page.locator('[data-slot="queue-list"]');
  expect(await queueList.evaluate((element) => getComputedStyle(element).scrollbarColor)).not.toBe(
    "auto",
  );
});
