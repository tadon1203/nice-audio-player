import { $, expect } from "@wdio/globals";

describe("Tauri desktop shell", () => {
  it("starts with app-owned titlebar and working window controls", async () => {
    await expect($('[data-slot="app-titlebar"]')).toBeDisplayed();
    await expect($("[data-tauri-drag-region]")).toBeDisplayed();
    await expect($('[role="group"][aria-label="Window controls"]')).toBeDisplayed();
    await expect($('button[aria-label="Minimize window"]')).toBeDisplayed();
    await expect($('button[aria-label="Maximize window"]')).toBeDisplayed();
    await expect($('button[aria-label="Close window"]')).toBeDisplayed();

    await $('button[aria-label="Maximize window"]').click();
    await expect($('button[aria-label="Restore window"]')).toBeDisplayed();
    await $('button[aria-label="Restore window"]').click();
    await expect($('button[aria-label="Maximize window"]')).toBeDisplayed();
  });
});
