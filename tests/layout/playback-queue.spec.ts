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
      await expect(shell.locator(".app-shell__workspace")).toHaveAttribute(
        "data-context-layout",
        "stacked",
      );
      await expect(shell.locator(".app-shell__main")).toBeVisible();
      await expect(shell.locator(".app-shell__main")).toHaveAttribute("inert", "");
      await expect(shell.locator(".app-shell__main")).toHaveAttribute("aria-hidden", "true");
    } else {
      await expect(shell.locator(".app-shell__main")).toBeVisible();
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

test("the 1439/1440 correction frame cannot retain layout projection", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1439, height: 800 });
  await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>(".app-shell__workspace");
    if (!workspace) return;
    const captures: Array<Record<string, string>> = [];
    const observer = new MutationObserver(() => {
      if (workspace.dataset.layoutCorrecting !== "true") return;
      const read = (selector: string) => {
        const element = workspace.querySelector<HTMLElement>(selector);
        return element ? getComputedStyle(element).transform : "missing";
      };
      captures.push({
        main: read(".app-shell__main"),
        content: read(".app-shell__main-content"),
        surface: read(".app-shell__main-surface"),
        context: read(".app-shell__context-pane"),
      });
    });
    observer.observe(workspace, { attributes: true, attributeFilter: ["data-layout-correcting"] });
    Object.assign(window, { __layoutCorrectionCaptures: captures });
  });

  await page.setViewportSize({ width: 1440, height: 800 });
  await expect(page.locator(".app-shell__workspace")).toHaveAttribute(
    "data-context-layout",
    "split",
  );
  await expect(page.locator(".app-shell__workspace")).toHaveAttribute(
    "data-layout-correcting",
    "false",
  );
  const captures = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __layoutCorrectionCaptures?: Array<Record<string, string>>;
        }
      ).__layoutCorrectionCaptures ?? [],
  );
  expect(captures.length).toBeGreaterThan(0);
  expect(
    captures.every((capture) => Object.values(capture).every((value) => value === "none")),
  ).toBe(true);

  await page.setViewportSize({ width: 1439, height: 800 });
  await expect(page.locator(".app-shell__workspace")).toHaveAttribute(
    "data-context-layout",
    "stacked",
  );
  await expect(page.locator(".app-shell__workspace")).toHaveAttribute(
    "data-layout-correcting",
    "false",
  );
  const reverseCaptures = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __layoutCorrectionCaptures?: Array<Record<string, string>>;
        }
      ).__layoutCorrectionCaptures ?? [],
  );
  expect(reverseCaptures.length).toBeGreaterThan(captures.length);
  expect(
    reverseCaptures.every((capture) => Object.values(capture).every((value) => value === "none")),
  ).toBe(true);
});

test("scrollable surfaces use the dark interface scrollbar treatment", async ({ page }) => {
  await openFixture(page, "queue-open", { width: 1120, height: 700 });
  const queueList = page.locator(".playback-queue__list");
  expect(await queueList.evaluate((element) => getComputedStyle(element).scrollbarColor)).not.toBe(
    "auto",
  );
});
