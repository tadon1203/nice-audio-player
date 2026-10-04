import { PNG } from "pngjs";
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Actual foreground and composited background, independent of the app's palette model. */
export async function readableText(page: Page, text: Locator) {
  await text.evaluate(async (element) => {
    const animations: Animation[] = [];
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      animations.push(
        ...parent
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity),
      );
    }
    await Promise.allSettled(animations.map((animation) => animation.finished));
  });
  const box = await text.boundingBox();
  expect(box).not.toBeNull();
  const ink = await text.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = style.color;
    context.fillRect(0, 0, 1, 1);
    const rgb = Array.from(context.getImageData(0, 0, 1, 1).data);
    let opacity = rgb[3]! / 255;
    for (let parent: Element | null = element; parent; parent = parent.parentElement)
      opacity *= Number(getComputedStyle(parent).opacity);
    return { rgb, opacity, size: parseFloat(style.fontSize), weight: style.fontWeight };
  });
  expect(ink.size).toBeGreaterThanOrEqual(14);
  expect(["400", "500"]).toContain(ink.weight);
  // Hide only ink; retain layout, artwork, Acrylic, and every composited surface.
  const previous = await text.evaluate((element) => {
    const previous = element.getAttribute("style");
    element.setAttribute(
      "style",
      `${previous ?? ""};transition:none !important;color:transparent !important`,
    );
    return previous;
  });
  let pixel: PNG;
  try {
    pixel = PNG.sync.read(
      await page.screenshot({
        clip: {
          x: Math.floor(box!.x + box!.width / 2),
          y: Math.floor(box!.y + box!.height / 2),
          width: 1,
          height: 1,
        },
      }),
    );
  } finally {
    await text.evaluate((element, previous) => {
      if (previous === null) element.removeAttribute("style");
      else element.setAttribute("style", previous);
    }, previous);
  }
  const background = Array.from(pixel.data.subarray(0, 3));
  const linear = (channel: number) =>
    channel / 255 <= 0.04045 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4;
  const luminance = (rgb: number[]) =>
    0.2126 * linear(rgb[0]!) + 0.7152 * linear(rgb[1]!) + 0.0722 * linear(rgb[2]!);
  const foreground = ink.rgb
    .slice(0, 3)
    .map((channel, i) => channel * ink.opacity + background[i]! * (1 - ink.opacity));
  const front = luminance(foreground),
    back = luminance(background);
  const ratio = (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
  expect(ratio, (await text.textContent()) ?? "text").toBeGreaterThanOrEqual(4.5);
  return { ...ink, foreground, ratio };
}
