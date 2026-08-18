/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LyricsTimedLine } from "@/bindings";
import type { AcceptedPlaybackSeek } from "./use-seek-controller";

const scrollMock = vi.hoisted(() => ({
  onUserScroll: null as (() => void) | null,
  scrollToElement: vi.fn(),
}));

vi.mock("./use-scroll-controller", () => ({
  useScrollController: (_element: HTMLElement | null, onUserScroll: () => void) => {
    scrollMock.onUserScroll = onUserScroll;
    return { scrollToElement: scrollMock.scrollToElement };
  },
}));

import { useLyricsFollow } from "./use-lyrics-follow";

const lines: LyricsTimedLine[] = [
  { startMs: 0, text: "First" },
  { startMs: 1_000, text: "Second" },
];

const playback = { id: "playback-1", revision: 1 };

describe("useLyricsFollow", () => {
  it("detaches on user scroll and returns with one smooth request", () => {
    const viewport = document.createElement("div");
    const line = document.createElement("p");
    line.dataset.cueOrdinal = "1";
    viewport.append(line);
    const scrollRef = { current: viewport };
    const { result } = renderHook(() =>
      useLyricsFollow(
        scrollRef,
        lines,
        1_000,
        playback.id,
        playback.revision,
        "track-1",
        true,
        viewport,
        null,
      ),
    );

    act(() => scrollMock.onUserScroll?.());
    expect(result.current.detached).toBe(true);
    scrollMock.scrollToElement.mockClear();

    act(() => result.current.returnToCurrentLine());
    expect(result.current.following).toBe(true);
    expect(scrollMock.scrollToElement).toHaveBeenLastCalledWith(line, "center", "smooth");
    expect(scrollMock.scrollToElement).not.toHaveBeenLastCalledWith(line, "center", "instant");
  });

  it("keeps automatic adjacent follow attached", () => {
    const viewport = document.createElement("div");
    const first = document.createElement("p");
    first.dataset.cueOrdinal = "0";
    const second = document.createElement("p");
    second.dataset.cueOrdinal = "1";
    viewport.append(first, second);
    const scrollRef = { current: viewport };
    const { result, rerender } = renderHook(
      ({ positionMs }) =>
        useLyricsFollow(
          scrollRef,
          lines,
          positionMs,
          playback.id,
          playback.revision,
          "track-1",
          true,
          viewport,
          null,
        ),
      { initialProps: { positionMs: 0 } },
    );

    rerender({ positionMs: 1_000 });

    expect(result.current.following).toBe(true);
    expect(result.current.detached).toBe(false);
    expect(scrollMock.scrollToElement).toHaveBeenLastCalledWith(second, "center", "smooth");
  });

  it("animates a successful accepted seek regardless of its control", () => {
    const jumpLines: LyricsTimedLine[] = [
      { startMs: 0, text: "First" },
      { startMs: 10_000, text: "Distant" },
    ];
    const viewport = document.createElement("div");
    const target = document.createElement("p");
    target.dataset.cueOrdinal = "1";
    viewport.append(target);
    const scrollRef = { current: viewport };
    const { result, rerender } = renderHook(
      ({ positionMs, revision, acceptedSeek }) =>
        useLyricsFollow(
          scrollRef,
          jumpLines,
          positionMs,
          playback.id,
          revision,
          "track-1",
          true,
          viewport,
          acceptedSeek,
        ),
      {
        initialProps: {
          positionMs: 0,
          revision: 1,
          acceptedSeek: null as AcceptedPlaybackSeek | null,
        },
      },
    );
    scrollMock.scrollToElement.mockClear();

    rerender({
      positionMs: 10_000,
      revision: 2,
      acceptedSeek: {
        id: 1,
        playbackId: playback.id,
        acceptedRevision: 2,
        positionMs: 10_000,
      },
    });

    expect(result.current.following).toBe(true);
    expect(scrollMock.scrollToElement).toHaveBeenLastCalledWith(target, "center", "smooth");
  });

  it("keeps a manual detachment over an accepted seek", () => {
    const viewport = document.createElement("div");
    const first = document.createElement("p");
    first.dataset.cueOrdinal = "0";
    const second = document.createElement("p");
    second.dataset.cueOrdinal = "1";
    viewport.append(first, second);
    const scrollRef = { current: viewport };
    const { result, rerender } = renderHook(
      ({ positionMs, revision, acceptedSeek }) =>
        useLyricsFollow(
          scrollRef,
          lines,
          positionMs,
          playback.id,
          revision,
          "track-1",
          true,
          viewport,
          acceptedSeek,
        ),
      {
        initialProps: {
          positionMs: 0,
          revision: 1,
          acceptedSeek: null as AcceptedPlaybackSeek | null,
        },
      },
    );
    act(() => scrollMock.onUserScroll?.());
    scrollMock.scrollToElement.mockClear();

    rerender({
      positionMs: 1_000,
      revision: 2,
      acceptedSeek: {
        id: 1,
        playbackId: playback.id,
        acceptedRevision: 2,
        positionMs: 1_000,
      },
    });

    expect(result.current.detached).toBe(true);
    expect(scrollMock.scrollToElement).not.toHaveBeenCalled();
  });

  it("restores follow when a cue seek was requested after detaching", () => {
    const viewport = document.createElement("div");
    const first = document.createElement("p");
    first.dataset.cueOrdinal = "0";
    const second = document.createElement("p");
    second.dataset.cueOrdinal = "1";
    viewport.append(first, second);
    const scrollRef = { current: viewport };
    const { result, rerender } = renderHook(
      ({ positionMs, revision, acceptedSeek }) =>
        useLyricsFollow(
          scrollRef,
          lines,
          positionMs,
          playback.id,
          revision,
          "track-1",
          true,
          viewport,
          acceptedSeek,
        ),
      {
        initialProps: {
          positionMs: 0,
          revision: 1,
          acceptedSeek: null as AcceptedPlaybackSeek | null,
        },
      },
    );
    act(() => scrollMock.onUserScroll?.());
    act(() => result.current.prepareCueSeek());
    scrollMock.scrollToElement.mockClear();

    rerender({
      positionMs: 1_000,
      revision: 2,
      acceptedSeek: {
        id: 1,
        playbackId: playback.id,
        acceptedRevision: 2,
        positionMs: 1_000,
      },
    });

    expect(result.current.following).toBe(true);
    expect(scrollMock.scrollToElement).toHaveBeenLastCalledWith(second, "center", "smooth");
  });
});
