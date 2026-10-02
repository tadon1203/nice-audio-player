import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";

async function styleOfInjected(page: Page, className: string) {
  return page.evaluate((name) => {
    const element = document.createElement("div");
    element.className = name;
    document.body.append(element);
    const { display, backgroundColor, backdropFilter } = getComputedStyle(element);
    element.remove();
    return { display, backgroundColor, backdropFilter };
  }, className);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="app-main"]')).toBeVisible();
});

test("Ink-3 is defined as its own ink, distinct from Ink-2", async ({ page }) => {
  const inks = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const read = (name: string) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };
    const result = { two: read("--muted-foreground"), three: read("--faint-foreground") };
    probe.remove();
    return result;
  });
  expect(inks.three).not.toBe(inks.two);
});

test("acrylic blurs what is underneath", async ({ page }) => {
  const acrylic = await styleOfInjected(page, "acrylic");
  expect(acrylic.backdropFilter).toContain("blur");
});

test("acrylic turns solid and Light disappears under forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  const acrylic = await styleOfInjected(page, "acrylic");
  const light = await styleOfInjected(page, "artwork-light");
  expect(acrylic.backdropFilter).toBe("none");
  expect(light.display).toBe("none");
});

test("the shell mounts inside the motion provider and keeps the workspace interactive", async ({
  page,
}) => {
  await expect(page.locator('[data-slot="now-playing"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="app-main"]')).not.toHaveAttribute("inert", /.*/);
});
