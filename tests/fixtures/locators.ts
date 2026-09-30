import type { Locator, Page } from "@playwright/test";

/** The one scroll region of the library workspace; the list inside scrolls in it. */
export const workspaceViewport = (page: Page): Locator =>
  page.locator('main [data-slot="scroll-area-viewport"]');
