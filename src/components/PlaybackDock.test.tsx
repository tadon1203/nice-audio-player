/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
import { PlaybackDock } from "./PlaybackDock";

const file: ValidatedAudioFile = {
  path: "C:/Music/test.flac",
  fileName: "Track.flac",
  extension: "flac",
};
const stopped: PlaybackSnapshot = {
  status: "stopped",
  revision: 0,
  file: null,
  volume: 0.5,
  muted: false,
  outputSelection: { kind: "systemDefault" },
  canGoPrevious: false,
  canGoNext: false,
};
const base = {
  playback: stopped,
  track: { title: "Track", artist: "Artist", artworkUrl: null, artworkLoading: false },
  transport: {
    available: true,
    pending: false,
    pendingCommand: null,
    hasResumablePlayback: true,
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
  },
  seek: { previewMs: null, pending: false, change: vi.fn(), commit: vi.fn(), cancel: vi.fn() },
  volume: {
    value: 50,
    updatePending: false,
    mutePending: false,
    change: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    toggleMute: vi.fn(),
  },
  context: { mode: null, toggle: vi.fn() },
  error: null,
};

describe("PlaybackDock", () => {
  afterEach(cleanup);
  it("renders the three semantic regions and core controls", () => {
    render(<PlaybackDock {...base} />);
    expect(
      Array.from(screen.getByTestId("playback-dock").querySelectorAll("[data-region]"), (e) =>
        e.getAttribute("data-region"),
      ),
    ).toEqual(["identity", "playback-core", "volume"]);
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.getByDisplayValue("0")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mute" })).toBeEnabled();
  });
  it("keeps seek preview authoritative", () => {
    render(
      <PlaybackDock
        {...base}
        playback={{
          status: "playing",
          revision: 1,
          file,
          playbackId: "1",
          positionMs: 500,
          durationMs: 1000,
          volume: 0.5,
          muted: false,
          outputSelection: { kind: "systemDefault" },
          canGoPrevious: false,
          canGoNext: false,
          outputDevice: { id: "default", name: "Default" },
          channelConversion: "none",
          sourceSampleRate: 44100,
          outputSampleRate: 44100,
          resamplingActive: false,
        }}
        seek={{ ...base.seek, previewMs: 700 }}
      />,
    );
    expect(screen.getByDisplayValue("700")).toHaveValue("700");
  });
  it("keeps the artwork frame after an image failure and resets for a new URL", async () => {
    const { rerender } = render(
      <PlaybackDock {...base} track={{ ...base.track, artworkUrl: "asset://one" }} />,
    );
    const frame = screen
      .getByTestId("playback-dock")
      .querySelector(".playback-dock__artwork-frame")!;
    const image = screen.getByTestId("playback-dock").querySelector("img")!;
    fireEvent.error(image);
    expect(screen.queryByRole("img")).toBeNull();
    expect(frame).toBeInTheDocument();
    rerender(<PlaybackDock {...base} track={{ ...base.track, artworkUrl: "asset://two" }} />);
    await waitFor(() =>
      expect(screen.getByTestId("playback-dock").querySelector("img")).toHaveAttribute(
        "src",
        "asset://two",
      ),
    );
  });
});
