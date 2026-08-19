/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackQueuePane } from "./PlaybackQueuePane";

const scrollToElement = vi.fn();
vi.mock("@/hooks/use-scroll-region", () => ({
  useScrollRegion: () => ({
    element: document.createElement("div"),
    setViewportElement: vi.fn(),
    setContentElement: vi.fn(),
    scrollToPosition: vi.fn(),
    scrollToElement,
    cancel: vi.fn(),
  }),
}));

const queue = {
  current: null,
  upcoming: [
    { id: "one", title: "First", artist: "Artist", durationMs: 1_000 },
    { id: "two", title: "Second", artist: "Artist", durationMs: 2_000 },
    { id: "three", title: "Third", artist: "Artist", durationMs: 3_000 },
  ],
  repeatMode: "off" as const,
  shuffleEnabled: false,
  pending: false,
  error: null,
  refresh: vi.fn(async () => undefined),
  setRepeatMode: vi.fn(),
  setShuffle: vi.fn(),
  removeItem: vi.fn(),
  moveItem: vi.fn(),
  clearUpcoming: vi.fn(),
};

describe("PlaybackQueuePane focus reveal", () => {
  beforeEach(() => scrollToElement.mockClear());
  afterEach(cleanup);

  it("keeps direct menu focus and its nearest reveal on the same frame", () => {
    render(<PlaybackQueuePane queue={queue} playbackStatus="playing" />);
    fireEvent.click(screen.getByRole("button", { name: "More actions for Second" }));
    const firstAction = screen.getByRole("menuitem", { name: "Move earlier" });
    expect(firstAction).toHaveFocus();
    expect(scrollToElement).toHaveBeenLastCalledWith(firstAction, "nearest", "instant");

    fireEvent.keyDown(firstAction, { key: "ArrowDown" });
    const secondAction = screen.getByRole("menuitem", { name: "Move later" });
    expect(secondAction).toHaveFocus();
    expect(scrollToElement).toHaveBeenLastCalledWith(secondAction, "nearest", "instant");
  });

  it("restores the connected trigger without retaining a stale menu action", () => {
    render(<PlaybackQueuePane queue={queue} playbackStatus="playing" />);
    const trigger = screen.getByRole("button", { name: "More actions for Second" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(scrollToElement).toHaveBeenLastCalledWith(trigger, "nearest", "instant");
  });
});
