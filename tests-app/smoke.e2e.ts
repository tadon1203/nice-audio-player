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

const dock = '[aria-label="Playback controls"]';
const seek = `${dock} [role="slider"][aria-label="Playback position"]`;
const layer = 'section[aria-label="Now Playing"]';
const show = `${layer} [role="group"][aria-label="Show"]`;
const meters = `${layer} section[aria-label="Meters"]`;

/** Calls a backend command through the app's own IPC, the way the renderer does. */
async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  // The rejection becomes a value inside the page: the plugin would otherwise turn a backend
  // `{ code }` into a message that says only "[object Object]".
  const reply = (await browser.tauri.execute(
    ({ core }, name: string, payload: Record<string, unknown>) =>
      core.invoke(name, payload).then(
        (value: unknown) => ({ value }),
        (error: unknown) => ({ error: JSON.stringify(error) }),
      ),
    command,
    args,
  )) as { value?: T; error?: string };
  if (reply.error !== undefined) throw new Error(`${command} rejected: ${reply.error}`);
  return reply.value as T;
}

const position = async (): Promise<number> => Number(await $(seek).getAttribute("aria-valuenow"));

/** Meter frames the renderer has consumed; the E2E build counts them (`meter-feed.svelte.ts`). */
const meterFrames = async (): Promise<number> =>
  (await browser.execute(
    () => (window as unknown as { __e2e?: { meterFrames: number } }).__e2e?.meterFrames,
  )) ?? 0;

/** Connections and state messages the renderer has had; the E2E build counts them (`e2e-counts.ts`). */
const e2eCounts = async (): Promise<{ connects: number; stateMessages: number }> =>
  browser.execute(
    () => (window as unknown as { __e2e: { connects: number; stateMessages: number } }).__e2e,
  );

describe("the real app", () => {
  it("starts and shows the library", async () => {
    await expect($("main")).toBeDisplayed();
    expect(await invoke<{ status: string }>("library_status")).toEqual({ status: "ready" });
  });

  it("serves artwork from the throwaway profile, a thumbnail falling back to the original", async () => {
    const hash = "ab".repeat(32);
    // Written now, not at launch: startup housekeeping deletes artwork no track owns.
    const shard = join(process.env.E2E_SCRATCH!, "data", "artwork", "ab");
    mkdirSync(shard, { recursive: true });
    writeFileSync(join(shard, `${hash}.png`), ONE_PIXEL_PNG);
    // An image element, because a fetch from the app's origin to the scheme's is cross-origin.
    const loadedWidth = (path: string): Promise<number> =>
      browser.execute(
        (url: string) =>
          new Promise<number>((resolve) => {
            const image = new Image();
            image.onload = (): void => resolve(image.naturalWidth);
            image.onerror = (): void => resolve(0);
            image.src = url;
          }),
        `http://nice-artwork.localhost/artwork/ab/${path}`,
      );

    expect(await loadedWidth(`${hash}.png`)).toBe(1);
    // No thumbnail was stored for it: the original is served in its place.
    expect(await loadedWidth(`${hash}.thumb.jpg`)).toBe(1);
  });

  it("scans a directory and lists its tracks", async () => {
    // The directory picker is a native dialog WebDriver cannot drive, so the directory is registered
    // through the command the picker's result goes to.
    // Registering a directory starts its scan by itself (after a short debounce), so the test does
    // not start one: a second start would be refused as already running.
    await invoke("library_add_directory", { path: musicDir });

    // The scan's end reaches the renderer on its channel, and the Library refreshes itself.
    await $("a=Tracks").click();
    await browser.waitUntil(async () => (await $$('button[aria-label^="Play "]').length) === 2, {
      timeout: 30_000,
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

  it("connects on start, gets state messages, and connects again after a reload", async () => {
    // The backend answered one connection when the app started, and no state message has been
    // counted since.
    expect((await e2eCounts()).connects).toBe(1);
    const before = (await e2eCounts()).stateMessages;
    await invoke("library_start_scan");
    await browser.waitUntil(async () => (await e2eCounts()).stateMessages > before, {
      timeoutMsg: "no state message reached the renderer",
    });

    // A track was skipped to earlier, so the backend has a previous one. A fresh page holds no
    // playback state, so the Previous button being enabled again means it came from `app_connect`.
    const previous = $(`${dock} button[aria-label="Previous track"]`);
    await expect(previous).toBeEnabled();
    await browser.refresh();

    // `connects` outlives the reload, so a second answered connection is the page connecting
    // again. It is counted after the state is applied, so the Dock is checked after it.
    await browser.waitUntil(async () => (await e2eCounts().catch(() => null))?.connects === 2, {
      timeoutMsg: "the reloaded page did not connect again",
    });
    await expect($(`${dock} button[aria-label="Previous track"]`)).toBeEnabled();
  });
});
