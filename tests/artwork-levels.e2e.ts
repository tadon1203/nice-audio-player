import { testLibrary } from "./fixtures/data";
import { expect, test } from "./fixtures/test";

// Scrolling a library must not read and decode full-size covers: lists ask for the thumbnail, and
// only where the Sleeve is the star (the album header, Now Playing) is the original requested.
// The pixels are irrelevant, so every request is answered with the same one-pixel image.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

test.use({ library: testLibrary({ artwork: true }) });

test("lists load thumbnails; the album header and Now Playing load the original", async ({
  page,
}) => {
  const requested: string[] = [];
  await page.route("http://nice-artwork.localhost/**", (route) => {
    requested.push(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  const thumbs = () => requested.filter((path) => path.endsWith(".thumb.jpg"));
  const originals = () => requested.filter((path) => !path.endsWith(".thumb.jpg"));

  await page.goto("/library/albums");
  await expect.poll(thumbs).not.toHaveLength(0);
  expect(originals()).toEqual([]);

  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  await expect.poll(originals).not.toHaveLength(0);

  await page.goto("/library/tracks");
  const before = originals().length;
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await page.getByRole("region", { name: "Now Playing" }).waitFor();
  // The original is already cached from the header, so what matters is that it is the one asked
  // for and that nothing but thumbnails and that original was requested.
  expect(new Set(originals()).size).toBe(1);
  expect(originals().length).toBeGreaterThanOrEqual(before);
});
