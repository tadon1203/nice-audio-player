import { chromium, type FullConfig } from "@playwright/test";

/** The dev server compiles on demand; load the app once so parallel tests do not race its first build. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto("/library/albums");
    await page.waitForLoadState("networkidle");
  } finally {
    await browser.close();
  }
}
