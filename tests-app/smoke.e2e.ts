import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, $, $$, expect } from "@wdio/globals";

// The real app, the real Rust backend, a real output device, over a throwaway profile: these
// check the seams the mocked renderer suite (`tests/`) cannot, not the UI.

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
const musicDir = process.env.E2E_MUSIC_DIR!;

// Selectors: regions are found by their `aria-label` with CSS, narrowing from the page to the
// element. A text selector (`button=Meters`) is only ever the last step of a chain, `$(scope).$(…)`:
// WebdriverIO cannot mix strategies in one selector. The dock's toggle button shares the label
// "Now Playing" with the layer, so the layer is picked by its tag.
const dock = '[aria-label="Playback controls"]';
const seek = `${dock} [role="slider"][aria-label="Playback position"]`;
const layer = 'section[aria-label="Now Playing"]';
const show = `${layer} [role="group"][aria-label="Show"]`;
const meters = `${layer} section[aria-label="Meters"]`;

/** Calls a backend command through the app's own IPC, the way the renderer does. */
async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const reply = await browser.executeAsync(
    (name: string, payload: Record<string, unknown>, done: (reply: unknown) => void) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (name: string, args: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      internals.invoke(name, payload).then(
        (value) => done({ value }),
        (error) => done({ error }),
      );
    },
    command,
    args,
  );
  const { value, error } = reply as { value?: T; error?: unknown };
  if (error !== undefined) throw new Error(`${command} rejected: ${JSON.stringify(error)}`);
  return value as T;
}

const position = async () => Number(await $(seek).getAttribute("aria-valuenow"));

/** Meter frames the renderer has consumed; the E2E build counts them (`meter-feed.svelte.ts`). */
const meterFrames = async () =>
  (await browser.execute(
    () => (window as unknown as { __e2e?: { meterFrames: number } }).__e2e?.meterFrames,
  )) ?? 0;

describe("the real app", () => {
  it("starts and shows the library", async () => {
    await expect($("main")).toBeDisplayed();
    expect(await invoke<{ status: string }>("get_library_status")).toEqual({ status: "ready" });
  });

  it("serves artwork from the throwaway profile, a thumbnail falling back to the original", async () => {
    const hash = "ab".repeat(32);
    // Written now, not at launch: startup housekeeping deletes artwork no track owns.
    const shard = join(process.env.E2E_SCRATCH!, "data", "artwork", "ab");
    mkdirSync(shard, { recursive: true });
    writeFileSync(join(shard, `${hash}.png`), ONE_PIXEL_PNG);
    // An image element, because a fetch from the app's origin to the scheme's is cross-origin.
    const loadedWidth = (path: string) =>
      browser.executeAsync((url: string, done: (width: number) => void) => {
        const image = new Image();
        image.onload = () => done(image.naturalWidth);
        image.onerror = () => done(0);
        image.src = url;
      }, `http://nice-artwork.localhost/artwork/ab/${path}`);

    expect(await loadedWidth(`${hash}.png`)).toBe(1);
    // No thumbnail was stored for it: the original is served in its place.
    expect(await loadedWidth(`${hash}.thumb.jpg`)).toBe(1);
  });

  it("scans a folder and lists its tracks", async () => {
    // The folder picker is a native dialog WebDriver cannot drive, so the folder is registered
    // through the command the picker's result goes to.
    await invoke("register_library_root", { path: musicDir });
    await invoke("start_library_scan");
    await browser.waitUntil(
      async () => (await invoke<{ state: string }>("get_library_scan_state")).state === "completed",
      { timeout: 30_000, timeoutMsg: "the scan did not complete" },
    );

    await $("a=Tracks").click();
    await browser.waitUntil(async () => (await $$('button[aria-label^="Play "]').length) === 2, {
      timeoutMsg: "the two fixture tracks were not listed",
    });
  });

  it("plays a track and its position advances", async () => {
    await $$('button[aria-label^="Play "]')[0]!.click();
    await expect($(`${dock} button[aria-label="Pause"]`)).toBeEnabled();
    const first = await position();
    await browser.waitUntil(async () => (await position()) > first, {
      timeoutMsg: "the position did not advance",
    });
  });

  it("pauses, resumes, seeks and moves to the next track", async () => {
    await $(`${dock} button[aria-label="Pause"]`).click();
    await expect($(`${dock} button[aria-label="Resume"]`)).toBeEnabled();
    await $(`${dock} button[aria-label="Resume"]`).click();
    await expect($(`${dock} button[aria-label="Pause"]`)).toBeEnabled();

    // The seek bar listens for pointer events, which WebDriver's click does not send (it fires
    // only a `click`), so it is operated by keyboard. One press is one step: further presses
    // before the bar's value updates (about once a second) would start from the same value.
    const before = await position();
    await browser.execute((element) => (element as HTMLElement).focus(), await $(seek));
    await browser.keys("ArrowRight");
    await browser.waitUntil(async () => (await position()) >= before + 5_000, {
      timeoutMsg: "the seek did not move the position",
    });

    await $(`${dock} button[aria-label="Next track"]`).click();
    await expect($(`${dock} button[aria-label="Previous track"]`)).toBeEnabled();
  });

  it("streams Meter frames while Meters is open and stops when it is closed", async () => {
    await $(`${dock} button[aria-label="Open Now Playing"]`).click();
    await $(show).$("button=Meters").click();
    await expect($(meters)).toBeDisplayed();

    // A silent file measures the floor on both channels, and a silent, unchanged measurement is
    // not sent: the renderer already shows the floor, so no frame streams while this plays.
    await expect($(meters).$$("span=-inf")).toBeElementsArrayOfSize(2);
    const silent = await meterFrames();
    await browser.pause(500);
    expect(await meterFrames()).toBe(silent);

    await $(show).$("button=Queue").click();
    await browser.pause(300);
    const stopped = await meterFrames();
    await browser.pause(500);
    expect(await meterFrames()).toBe(stopped);
  });
});
