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
    await expect(contextPane.locator(".app-shell__context-content")).toHaveAttribute(
      "data-state",
      "open",
    );
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
      await expect(shell.locator(".app-shell__main")).toBeVisible();
      await expect(shell.locator(".app-shell__main")).toHaveAttribute("inert", "");
      await expect(shell.locator(".app-shell__main")).toHaveAttribute("aria-hidden", "true");
    } else {
      await expect(shell.locator(".app-shell__main")).toBeVisible();
      await expect(shell.locator(".app-shell__main")).not.toHaveAttribute("inert", "");
      const contextBox = await contextPane.boundingBox();
      expect(contextBox?.width).toBeGreaterThanOrEqual(360);
    }
  });
}

test("Queue exit is inert and uses no authored structural CSS transition", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const contextPane = page.locator(".app-shell__context-pane");
  await page
    .getByTestId("playback-queue")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  const contextContent = contextPane.locator(".app-shell__context-content");
  await expect(contextContent).toHaveAttribute("data-state", "closing");
  expect(
    await contextPane.evaluate((element) => getComputedStyle(element).transitionProperty),
  ).not.toContain("inline-size");
  await expect(contextContent).toHaveCSS("pointer-events", "none");
  await expect(contextContent).toHaveAttribute("aria-hidden", "true");
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
    const contextPane = page.locator(".app-shell__context-pane");
    await page.getByTestId("playback-queue").getByRole("button", { name: "Close" }).click();
    await expect(shell.locator(".app-shell__workspace")).toHaveAttribute(
      "data-context-open",
      "false",
    );
    await expect(shell.locator(".app-shell__main")).toBeVisible();
    await expect(shell.locator(".app-shell__main")).not.toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name: "Open queue" })).toBeFocused();
    await expect(contextPane).toBeHidden();
  });
}

test("Queue desktop endpoint changes without grid-track CSS interpolation", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1440, height: 900 });
  const shell = page.getByTestId("app-shell");
  const workspace = shell.locator(".app-shell__workspace");
  expect(
    await workspace.evaluate((element) => getComputedStyle(element).transitionProperty),
  ).not.toContain("grid-template");

  await page.getByTestId("playback-queue").getByRole("button", { name: "Close" }).click();
  await expect(shell.locator(".app-shell__main")).toBeVisible();
});

test("the 1439/1440 breakpoint switches geometry and semantics without a correction state", async ({
  page,
}) => {
  await openFixture(page, "queue-open", { width: 1439, height: 800 });
  await expect(page.locator(".app-shell__main")).toHaveAttribute("inert", "");
  await page.setViewportSize({ width: 1440, height: 800 });
  await expect(page.locator(".app-shell__main")).not.toHaveAttribute("inert", "");
  const splitContextBox = await page.locator(".app-shell__context-pane").boundingBox();
  expect(splitContextBox?.width).toBeGreaterThanOrEqual(360);

  await page.setViewportSize({ width: 1439, height: 800 });
  await expect(page.locator(".app-shell__main")).toHaveAttribute("inert", "");
});

test("Queue preserves semantics and focus with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const shell = page.getByTestId("app-shell");

  await expect(shell.locator(".app-shell__main")).toHaveAttribute("inert", "");
  await page.getByTestId("playback-queue").getByRole("button", { name: "Close" }).click();
  await expect(shell.locator(".app-shell__main")).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Open queue" })).toBeFocused();
});

test("scrollable surfaces use the dark interface scrollbar treatment", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const queueList = page.locator(".playback-queue__list");
  expect(await queueList.evaluate((element) => getComputedStyle(element).scrollbarColor)).not.toBe(
    "auto",
  );
});
