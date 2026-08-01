/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
import { layoutStressFixtures } from "@/test/layout-stress-fixtures";

import { PlaybackDock } from "./PlaybackDock";

const playback: PlaybackSnapshot = {
  status: "stopped",
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
  isTransportCommandPending: false,
  pendingTransportCommand: null,
  isScrubbing: false,
  positionDraft: 0,
  isSeekPending: false,
  isAdjustingVolume: false,
  volumeDraft: 50,
  isVolumePending: false,
  statusMessage: "",
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

  it("keeps the five control regions in reading order", () => {
    render(<PlaybackDock {...props} />);

    const regions = Array.from(
      screen.getByTestId("playback-dock").querySelectorAll("[data-region]"),
      (element) => element.getAttribute("data-region"),
    );
    expect(regions).toEqual(["identity", "transport", "timeline", "volume", "output", "status"]);
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
            playbackId: "1",
            positionMs: 0,
            durationMs: 1000,
            volume: 0.5,
            muted: false,
            outputSelection: { kind: "systemDefault" },
            outputDevice: { id: "default", name: "Default" },
          };

    render(<PlaybackDock {...props} playback={state} />);
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("renders the playback error once in the dock error region", () => {
    render(<PlaybackDock {...props} playbackError="Playback failed." />);

    expect(screen.getByText("Playback failed.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("uses the volume draft consistently while adjusting", () => {
    render(<PlaybackDock {...props} isAdjustingVolume volumeDraft={80} />);

    const slider = screen.getByRole("slider", { name: "Playback volume" });
    expect(slider).toHaveValue("80");
    expect(slider).toHaveAttribute("aria-valuetext", "80 percent");
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("keeps transport controls stable while a seek is pending", () => {
    render(
      <PlaybackDock
        {...props}
        isSeekPending
        playback={{
          status: "playing",
          playbackId: "1",
          positionMs: 500,
          durationMs: 1000,
          volume: 0.5,
          muted: false,
          outputSelection: { kind: "systemDefault" },
          outputDevice: { id: "default", name: "Default" },
        }}
      />,
    );

    const pause = screen.getByRole("button", { name: "Pause" });
    expect(pause).toBeEnabled();
    expect(pause.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Playback position" })).toBeDisabled();
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
          playbackId: "1",
          positionMs: 0,
          durationMs: 1000,
          volume: 0.5,
          muted: false,
          outputSelection: { kind: "systemDefault" },
          outputDevice: { id: "default", name: "Default" },
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Pause" })).toHaveClass(
      "size-12",
      "disabled:bg-surface-pressed",
      "disabled:text-text-disabled",
    );
    expect(screen.getByRole("button", { name: "Stop" })).toHaveClass(
      "size-10",
      "disabled:border-border-subtle",
      "disabled:text-text-disabled",
    );
    expect(screen.getByRole("slider", { name: "Playback position" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Playback volume" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Audio output device" })).toBeDisabled();
  });
});
