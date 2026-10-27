import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  goto: vi.fn(async () => undefined),
  page: { state: {} as { nowPlaying?: boolean }, url: new URL("http://localhost/library") },
}));

vi.mock("$app/navigation", () => ({ goto: mocks.goto }));
vi.mock("$app/state", () => ({ page: mocks.page }));

import { NowPlaying } from "./now-playing.svelte";

beforeEach(() => {
  mocks.goto.mockClear();
  mocks.page.state = {};
});

describe("NowPlaying", () => {
  it("reads whether it is open from the page state", () => {
    const nowPlaying = new NowPlaying();
    expect(nowPlaying.isOpen).toBe(false);
    mocks.page.state = { nowPlaying: true };
    expect(nowPlaying.isOpen).toBe(true);
  });

  it("opens by pushing an entry at the same location", () => {
    new NowPlaying().open();

    expect(mocks.goto).toHaveBeenCalledWith(mocks.page.url.href, {
      shallow: true,
      replace: false,
      state: { nowPlaying: true },
    });
  });

  it("does not push again when it is already open", () => {
    mocks.page.state = { nowPlaying: true };
    new NowPlaying().open();

    expect(mocks.goto).not.toHaveBeenCalled();
  });

  it("closes with Back when there is an entry to go back to", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => undefined);
    const length = vi.spyOn(history, "length", "get").mockReturnValue(2);
    mocks.page.state = { nowPlaying: true };

    new NowPlaying().close();

    expect(back).toHaveBeenCalledTimes(1);
    expect(mocks.goto).not.toHaveBeenCalled();
    back.mockRestore();
    length.mockRestore();
  });

  it("closes by replacing the entry when there is no entry to go back to", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => undefined);
    const length = vi.spyOn(history, "length", "get").mockReturnValue(1);
    mocks.page.state = { nowPlaying: true };

    new NowPlaying().close();

    expect(back).not.toHaveBeenCalled();
    expect(mocks.goto).toHaveBeenCalledWith(mocks.page.url.href, {
      shallow: true,
      replace: true,
      state: { nowPlaying: false },
    });
    back.mockRestore();
    length.mockRestore();
  });

  it("does nothing when closing while closed", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => undefined);

    new NowPlaying().close();

    expect(back).not.toHaveBeenCalled();
    expect(mocks.goto).not.toHaveBeenCalled();
    back.mockRestore();
  });
});
