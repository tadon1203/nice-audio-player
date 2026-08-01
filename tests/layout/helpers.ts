import { expect, type Locator, type Page } from "@playwright/test";

export interface TestViewport {
  width: number;
  height: number;
}

export const supportedViewports: TestViewport[] = [
  { width: 640, height: 800 },
  { width: 800, height: 600 },
  { width: 1120, height: 700 },
  { width: 1440, height: 900 },
];

export async function openFixture(page: Page, fixture: string, viewport: TestViewport) {
  await page.setViewportSize(viewport);
  await page.goto(`/?layoutFixture=${fixture}`);
  await expect(page.locator("[data-layout-fixture]")).toHaveAttribute(
    "data-layout-fixture",
    fixture,
  );
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.locator("html").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function expectContainedBy(inner: Locator, outer: Locator) {
  const [innerBox, outerBox] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  expect(innerBox).not.toBeNull();
  expect(outerBox).not.toBeNull();
  if (innerBox === null || outerBox === null) {
    return;
  }
  expect(innerBox.x).toBeGreaterThanOrEqual(outerBox.x - 1);
  expect(innerBox.y).toBeGreaterThanOrEqual(outerBox.y - 1);
  expect(innerBox.x + innerBox.width).toBeLessThanOrEqual(outerBox.x + outerBox.width + 1);
  expect(innerBox.y + innerBox.height).toBeLessThanOrEqual(outerBox.y + outerBox.height + 1);
}
