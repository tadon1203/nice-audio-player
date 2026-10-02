import { browser, $, $$, expect } from "@wdio/globals";

// The real app, the real Rust backend, a real output device, over a throwaway profile: these
// check the seams the mocked renderer suite (`tests/`) cannot, not the UI.

const musicDir = process.env.E2E_MUSIC_DIR!;
const dock = '[aria-label="Playback controls"]';
const seek = `${dock} [role="slider"][aria-label="Playback position"]`;

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

describe("the real app", () => {
  it("starts and shows the library", async () => {
    await expect($("main")).toBeDisplayed();
    expect(await invoke<{ status: string }>("get_library_status")).toEqual({ status: "ready" });
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
});
