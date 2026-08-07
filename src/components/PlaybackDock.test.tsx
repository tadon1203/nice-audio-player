/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
import { layoutStressFixtures } from "@/test/layout-stress-fixtures";

import { PlaybackDock } from "./PlaybackDock";

const playback: PlaybackSnapshot = {
  status: "stopped",
  revision: 0,
  file: null,
  volume: 0.5,
  muted: false,
  outputSelection: { kind: "systemDefault" },
};

const file: ValidatedAudioFile = {
  path: "C:/Music/test.flac",
  fileName: layoutStressFixtures.longFilename,
  extension: "flac",
};

const props = {
  playback,
  validatedFile: file,
  outputDevices: [],
  isLoadingDevices: false,
  isOutputSelectionPending: false,
  isPlaybackAvailable: true,
  isTransportCommandPending: false,
  pendingTransportCommand: null,
  seekPreviewMs: null,
  isSeekPending: false,
  volumeValue: 50,
  isVolumePending: false,
  isVolumeSliderDisabled: false,
  playbackError: null,
  deviceListError: null,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onStop: vi.fn(),
  onSeek: vi.fn(),
  onSeekCommit: vi.fn(),
  onSeekCancel: vi.fn(),
  onVolumeChange: vi.fn(),
  onVolumePointerDown: vi.fn(),
  onVolumeCommit: vi.fn(),
  onVolumePointerCancel: vi.fn(),
  onMuteToggle: vi.fn(),
  onOutputSelectionChange: vi.fn(),
  onRefreshDevices: vi.fn(),
};

describe("PlaybackDock", () => {
  afterEach(cleanup);

  it("keeps the supported controls present while stopped", () => {
    render(<PlaybackDock {...props} />);

    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Playback position" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Playback volume" })).toHaveValue("50");
    expect(screen.getByRole("button", { name: "Mute" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Audio output device" })).toHaveValue(
      "systemDefault",
    );
    expect(screen.getByRole("button", { name: "Refresh output devices" })).toBeEnabled();
  });

  it("uses the authoritative position when there is no seek preview", () => {
    render(
      <PlaybackDock
        {...props}
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
          outputDevice: { id: "default", name: "Default" },
          channelConversion: "none",
          sourceSampleRate: 44_100,
          outputSampleRate: 44_100,
          resamplingActive: false,
        }}
      />,
    );

    expect(screen.getByRole("slider", { name: "Playback position" })).toHaveValue("500");
  });

  it("keeps the five control regions in reading order", () => {
    render(<PlaybackDock {...props} />);

    const regions = Array.from(
      screen.getByTestId("playback-dock").querySelectorAll("[data-region]"),
      (element) => element.getAttribute("data-region"),
    );
    expect(regions).toEqual(["identity", "transport", "timeline", "volume", "output"]);
    expect(screen.getByText(file.fileName)).toHaveAttribute("title", file.fileName);
    expect(screen.getByRole("combobox", { name: "Audio output device" })).toHaveAccessibleName(
      "Audio output device",
    );
    for (const icon of screen.getByTestId("playback-dock").querySelectorAll("svg")) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it.each([
    ["stopped", "Play"],
    ["playing", "Pause"],
    ["paused", "Resume"],
  ] as const)("uses the %s primary action label", (status, label) => {
    const state: PlaybackSnapshot =
      status === "stopped"
        ? playback
        : {
            status,
            revision: 1,
            file,
            playbackId: "1",
            positionMs: 0,
            durationMs: 1000,
            volume: 0.5,
            muted: false,
            outputSelection: { kind: "systemDefault" },
            outputDevice: { id: "default", name: "Default" },
            channelConversion: "none",
            sourceSampleRate: 44_100,
            outputSampleRate: 44_100,
            resamplingActive: false,
          };

    render(<PlaybackDock {...props} playback={state} />);
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("renders the playback error once in the dock error region", () => {
    render(<PlaybackDock {...props} playbackError="Playback failed." />);

    expect(screen.getByText("Playback failed.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("Playback failed.").closest('[data-region="status"]')).not.toBeNull();
  });

  it.each([
    ["monoToStereo", "Output: Mono → stereo"],
    ["stereoToMono", "Output: Stereo → mono"],
  ] as const)("reports %s output processing", (channelConversion, label) => {
    render(
      <PlaybackDock
        {...props}
        playback={{
          status: "playing",
          revision: 1,
          file,
          playbackId: "1",
          positionMs: 0,
          durationMs: 1000,
          volume: 0.5,
          muted: false,
          outputSelection: { kind: "systemDefault" },
          outputDevice: { id: "default", name: "Default" },
          channelConversion,
          sourceSampleRate: 44_100,
          outputSampleRate: 44_100,
          resamplingActive: false,
        }}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("does not render a status region when there is no error", () => {
    render(<PlaybackDock {...props} />);

    expect(screen.getByTestId("playback-dock").querySelector('[data-region="status"]')).toBeNull();
  });

  it("uses the supplied volume value consistently", () => {
    render(<PlaybackDock {...props} volumeValue={80} />);

    const slider = screen.getByRole("slider", { name: "Playback volume" });
    expect(slider).toHaveValue("80");
    expect(slider).toHaveAttribute("aria-valuetext", "80 percent");
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("keeps the volume slider enabled during live volume updates", () => {
    render(<PlaybackDock {...props} isVolumePending volumeValue={80} />);

    expect(screen.getByRole("slider", { name: "Playback volume" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mute" })).toBeDisabled();
    expect(
      screen.getByRole("slider", { name: "Playback volume" }).closest('[data-region="volume"]'),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("disables volume adjustment while mute is pending", () => {
    render(<PlaybackDock {...props} isVolumePending isVolumeSliderDisabled />);

    expect(screen.getByRole("slider", { name: "Playback volume" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mute" })).toBeDisabled();
  });

  it("keeps transport controls stable while a seek is pending", () => {
    render(
      <PlaybackDock
        {...props}
        isSeekPending
        seekPreviewMs={700}
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
          outputDevice: { id: "default", name: "Default" },
          channelConversion: "none",
          sourceSampleRate: 44_100,
          outputSampleRate: 44_100,
          resamplingActive: false,
        }}
      />,
    );

    const pause = screen.getByRole("button", { name: "Pause" });
    expect(pause).toBeEnabled();
    expect(pause.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Playback position" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Playback position" })).toHaveValue("700");
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Playback position" }).closest('[data-region="timeline"]'),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("uses disabled design tokens while preserving control dimensions", () => {
    render(
      <PlaybackDock
        {...props}
        isTransportCommandPending
        isVolumePending
        isLoadingDevices
        playback={{
          status: "playing",
          revision: 1,
          file,
          playbackId: "1",
          positionMs: 0,
          durationMs: 1000,
          volume: 0.5,
          muted: false,
          outputSelection: { kind: "systemDefault" },
          outputDevice: { id: "default", name: "Default" },
          channelConversion: "none",
          sourceSampleRate: 44_100,
          outputSampleRate: 44_100,
          resamplingActive: false,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Pause" })).toHaveClass(
      "size-12",
      "disabled:bg-surface-pressed",
      "disabled:text-text-disabled",
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Stop" })).toHaveClass(
      "size-10",
      "disabled:border-border-subtle",
      "disabled:text-text-disabled",
    );
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Playback position" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Playback volume" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Audio output device" })).toBeDisabled();
  });
});
