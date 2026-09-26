import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

test.beforeEach(async ({ page }) => installNativeApi(page));

for (const path of ["/library/albums", "/library/tracks", "/settings"] as const) {
  test(`has no automatically detectable serious accessibility violations on ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serious).toEqual([]);
  });
}

test("keeps the mobile navigation sheet accessible", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/library/albums");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Application" })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});
