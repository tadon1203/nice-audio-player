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
    const contextPane = shell.locator(".app-shell__context-pane");
    const queue = page.getByTestId("playback-queue");

    await expect(queue).toBeVisible();
    await expect(contextPane).toHaveAttribute("data-state", "open");
    await expect(queue.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(queue.locator(".playback-queue__list")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const horizontalScroll = await queue.locator(".playback-queue__list").evaluate((element) => {
      const list = element as HTMLElement;
      return {
        overflowX: getComputedStyle(list).overflowX,
      };
    });
    expect(horizontalScroll.overflowX).not.toMatch(/auto|scroll/);

    const rowContentFits = await queue.locator(".playback-queue__row").evaluateAll((rows) =>
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
    const dockBox = await shell.locator(".app-shell__persistent").boundingBox();
    expect(queueBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(
      Math.abs((queueBox?.y ?? 0) + (queueBox?.height ?? 0) - (dockBox?.y ?? 0)),
    ).toBeLessThanOrEqual(1);

    if (viewport.width < 1440) {
      await expect(shell.locator(".app-shell__main")).toBeHidden();
    } else {
      await expect(shell.locator(".app-shell__main")).toBeVisible();
      const contextBox = await contextPane.boundingBox();
      expect(contextBox?.width).toBeGreaterThanOrEqual(360);
    }
  });
}

test("Queue close transition preserves a spatial exit state", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const contextPane = page.locator(".app-shell__context-pane");
  await page
    .getByTestId("playback-queue")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(contextPane).toHaveAttribute("data-state", "closing");
  const contextContent = contextPane.locator(".app-shell__context-content");
  expect(
    await contextContent.evaluate((element) => getComputedStyle(element).transitionProperty),
  ).toContain("transform");
  expect(
    await contextPane.evaluate((element) => getComputedStyle(element).transitionProperty),
  ).toContain("inline-size");
  await expect(contextPane).toHaveCSS("pointer-events", "none");
});

test("Queue content slides independently from its closing region", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1440, height: 900 });
  const contextPane = page.locator(".app-shell__context-pane");
  const contextContent = contextPane.locator(".app-shell__context-content");

  await page.getByTestId("playback-queue").getByRole("button", { name: "Close" }).click();
  await expect(contextContent).toHaveAttribute("data-state", "closing");
  await expect(contextContent).toHaveCSS("transform", /matrix\(/);
  await expect(contextContent).toHaveCSS("opacity", "0");
});

test("Queue desktop column animates its region width", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1440, height: 900 });
  const shell = page.getByTestId("app-shell");
  const contextPane = shell.locator(".app-shell__context-pane");
  expect(
    await shell
      .locator(".app-shell__workspace")
      .evaluate((element) => getComputedStyle(element).transitionProperty),
  ).toContain("--context-pane-size");

  await page.getByTestId("playback-queue").getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(40);
  const box = await contextPane.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.width).toBeLessThan(400);
});

test("scrollable surfaces use the dark interface scrollbar treatment", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const queueList = page.locator(".playback-queue__list");
  expect(await queueList.evaluate((element) => getComputedStyle(element).scrollbarColor)).not.toBe(
    "auto",
  );
});
