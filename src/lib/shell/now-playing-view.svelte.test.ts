import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  goto: vi.fn(async () => undefined),
  page: { state: {} as { nowPlaying?: boolean }, url: new URL("http://localhost/library") },
}));

vi.mock("$app/navigation", () => ({ goto: mocks.goto }));
vi.mock("$app/state", () => ({ page: mocks.page }));

import { NowPlayingView } from "./now-playing-view.svelte";

beforeEach(() => {
  mocks.goto.mockClear();
  mocks.page.state = {};
});

describe("NowPlayingView", () => {
  it("reads whether it is open from the page state", () => {
    const view = new NowPlayingView();
    expect(view.isOpen).toBe(false);
    mocks.page.state = { nowPlaying: true };
    expect(view.isOpen).toBe(true);
  });

  it("opens by pushing a shallow entry at the same location", () => {
    new NowPlayingView().open();

    expect(mocks.goto).toHaveBeenCalledWith(mocks.page.url.href, {
      shallow: true,
      state: { nowPlaying: true },
      persistState: true,
    });
  });

  it("does not push again when it is already open", () => {
    mocks.page.state = { nowPlaying: true };
    new NowPlayingView().open();

    expect(mocks.goto).not.toHaveBeenCalled();
  });

  it("closes the entry it pushed with Back", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => undefined);
    const view = new NowPlayingView();
    view.open();
    mocks.page.state = { nowPlaying: true };

    view.close();

    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it("closes by replacing the entry when it was reached by a reload", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => undefined);
    mocks.page.state = { nowPlaying: true };

    new NowPlayingView().close();

    expect(back).not.toHaveBeenCalled();
    expect(mocks.goto).toHaveBeenCalledWith(mocks.page.url.href, {
      shallow: true,
      replace: true,
      state: { nowPlaying: false },
      persistState: true,
    });
    back.mockRestore();
  });

  it("does nothing when closing while closed", () => {
    new NowPlayingView().close();

    expect(mocks.goto).not.toHaveBeenCalled();
  });
});
