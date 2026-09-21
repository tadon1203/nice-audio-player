import { _electron as electron, test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("development Electron shell starts and exposes the renderer", async () => {
  const app = await electron.launch({
    args: [resolve("out/main/index.js")],
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "1",
      ELECTRON_RENDERER_URL: process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:5173",
    },
  });
  app.process().stderr?.on("data", (chunk) => console.log(`[electron] ${chunk.toString()}`));
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle("Nice Audio Player");
    await expect(window.getByRole("main")).toBeVisible();
    await expect(window.getByRole("link", { name: "Albums" })).toBeVisible();
    expect(await window.evaluate(() => typeof window.electron)).toBe("object");

    await window.getByRole("link", { name: "Tracks" }).click();
    await expect.poll(() => new URL(window.url()).pathname).toBe("/library/tracks");
    const search = window.getByRole("searchbox", { name: "Filter library" });
    await search.fill("ambient");
    await expect.poll(() => new URL(window.url()).search).toContain("tracksFilter=ambient");

    await window.getByRole("link", { name: "Settings" }).click();
    await expect.poll(() => new URL(window.url()).pathname).toBe("/settings");
    await expect(window.getByRole("main")).toBeVisible();
    expect(
      await window.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  } finally {
    await app.close();
  }
});
