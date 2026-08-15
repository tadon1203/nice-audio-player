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
  hasResumablePlayback: true,
  isPlaybackAvailable: true,
  isTransportCommandPending: false,
  pendingTransportCommand: null,
  seekPreviewMs: null,
  isSeekPending: false,
  volumeValue: 50,
  isVolumeUpdatePending: false,
  isMutePending: false,
  playbackError: null,
  presentationTitle: "Track",
  presentationArtist: "Artist",
  artworkUrl: null,
  artworkLoading: false,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onSeek: vi.fn(),
  onSeekCommit: vi.fn(),
  onSeekCancel: vi.fn(),
  onVolumeChange: vi.fn(),
  onVolumeInteractionStart: vi.fn(),
  onVolumeCommit: vi.fn(),
  onVolumePointerCancel: vi.fn(),
  onVolumeButtonPress: vi.fn(),
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
    expect(screen.getByRole("slider", { name: "Playback position" })).toBeDisabled();
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
        seekPreviewMs={700}
      />,
    );
    expect(screen.getByRole("slider", { name: "Playback position" })).toHaveValue("700");
  });
  it("keeps the artwork frame after an image failure and resets for a new URL", async () => {
    const { rerender } = render(<PlaybackDock {...base} artworkUrl="asset://one" />);
    const frame = screen
      .getByTestId("playback-dock")
      .querySelector(".playback-dock__artwork-frame")!;
    const image = screen.getByTestId("playback-dock").querySelector("img")!;
    fireEvent.error(image);
    expect(screen.queryByRole("img")).toBeNull();
    expect(frame).toBeInTheDocument();
    rerender(<PlaybackDock {...base} artworkUrl="asset://two" />);
    await waitFor(() =>
      expect(screen.getByTestId("playback-dock").querySelector("img")).toHaveAttribute(
        "src",
        "asset://two",
      ),
    );
  });
});
