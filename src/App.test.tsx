/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybackSnapshot } from "@/bindings";

const mocks = vi.hoisted(() => ({
  getPlaybackState: vi.fn(),
  listenToPlaybackState: vi.fn(),
  listAudioOutputDevices: vi.fn(),
  startAudioFile: vi.fn(),
  stopAudioPlayback: vi.fn(),
  pauseAudioPlayback: vi.fn(),
  seekAudioPlayback: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@/api/audio-devices", () => ({
  isAudioDeviceListError: vi.fn(() => false),
  isSetAudioOutputSelectionError: vi.fn(() => false),
  listAudioOutputDevices: mocks.listAudioOutputDevices,
  setAudioOutputSelection: vi.fn(),
}));
vi.mock("@/api/audio-files", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/audio-files")>();
  return {
    ...original,
    getPlaybackState: mocks.getPlaybackState,
    listenToPlaybackState: mocks.listenToPlaybackState,
    startAudioFile: mocks.startAudioFile,
    stopAudioPlayback: mocks.stopAudioPlayback,
    pauseAudioPlayback: mocks.pauseAudioPlayback,
    seekAudioPlayback: mocks.seekAudioPlayback,
    resumeAudioPlayback: vi.fn(),
  };
});

import App from "./App";

const file = { path: "C:/track.flac", fileName: "track.flac", extension: "flac" };

function stopped(revision: number): PlaybackSnapshot {
  return {
    status: "stopped",
    revision,
    file,
    volume: 1,
    muted: false,
    outputSelection: { kind: "systemDefault" },
  };
}

function playingAt(
  revision: number,
  positionMs: number,
): Extract<PlaybackSnapshot, { status: "playing" }> {
  return {
    status: "playing",
    revision,
    file,
    playbackId: "1",
    positionMs,
    durationMs: 10_000,
    volume: 1,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    outputDevice: { id: "default", name: "Speakers" },
    channelConversion: "none",
    sourceSampleRate: 44_100,
    outputSampleRate: 44_100,
    resamplingActive: false,
  };
}

function playing(revision: number) {
  return playingAt(revision, 1_000);
}

function paused(revision: number): Extract<PlaybackSnapshot, { status: "paused" }> {
  return { ...playing(revision), status: "paused" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("App playback coordination", () => {
  let emitSnapshot: (snapshot: PlaybackSnapshot) => void;
  let emitInvalidSnapshot: () => void;

  beforeEach(() => {
    mocks.listAudioOutputDevices.mockResolvedValue([]);
    mocks.listenToPlaybackState.mockImplementation(
      async (handler: (snapshot: PlaybackSnapshot) => void, invalidHandler: () => void) => {
        emitSnapshot = handler;
        emitInvalidSnapshot = invalidHandler;
        return vi.fn();
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not let a stale start response overwrite a newer stopped event", async () => {
    mocks.getPlaybackState.mockResolvedValue(stopped(1));
    const start = deferred<PlaybackSnapshot>();
    mocks.startAudioFile.mockReturnValue(start.promise);
    render(<App />);

    const play = await screen.findByRole("button", { name: "Play" });
    await waitFor(() => expect(play).toBeEnabled());
    await userEvent.click(play);
    expect(play).toBeEnabled();
    expect(play).toHaveAttribute("aria-busy", "true");

    emitSnapshot(stopped(3));
    start.resolve(playing(2));

    await waitFor(() => expect(mocks.startAudioFile).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  it("keeps authoritative transport controls stable while stop is pending", async () => {
    mocks.getPlaybackState.mockResolvedValue(playing(1));
    const stop = deferred<PlaybackSnapshot>();
    mocks.stopAudioPlayback.mockReturnValue(stop.promise);
    render(<App />);

    const pause = await screen.findByRole("button", { name: "Pause" });
    const stopButton = screen.getByRole("button", { name: "Stop" });
    await waitFor(() => expect(pause).toBeEnabled());
    await userEvent.click(stopButton);

    expect(pause).toBeEnabled();
    expect(stopButton).toBeEnabled();
    expect(stopButton).toHaveAttribute("aria-busy", "true");

    stop.resolve(stopped(2));
    await screen.findByRole("button", { name: "Play" });
  });

  it("keeps controls unavailable when event subscription fails", async () => {
    mocks.listenToPlaybackState.mockRejectedValue(new Error("listen failed"));
    render(<App />);

    expect(
      await screen.findByText(
        "The playback service could not be synchronized. Restart the application to retry.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Playback volume" })).toBeDisabled();
  });

  it("treats a malformed playback event as a synchronization failure", async () => {
    mocks.getPlaybackState.mockResolvedValue(stopped(1));
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeEnabled());
    emitInvalidSnapshot();

    expect(
      await screen.findByText(
        "Playback updates could not be read. Restart the application to reconnect.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("serializes a newer stop intent behind an in-flight pause", async () => {
    mocks.getPlaybackState.mockResolvedValue(playing(1));
    const pause = deferred<PlaybackSnapshot>();
    mocks.pauseAudioPlayback.mockReturnValue(pause.promise);
    mocks.stopAudioPlayback.mockResolvedValue(stopped(3));
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Pause" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(mocks.stopAudioPlayback).not.toHaveBeenCalled();

    pause.resolve(paused(2));
    await waitFor(() => expect(mocks.stopAudioPlayback).toHaveBeenCalledOnce());
    await screen.findByRole("button", { name: "Play" });
  });

  it("retains the last device list when refresh fails", async () => {
    mocks.getPlaybackState.mockResolvedValue(stopped(1));
    mocks.listAudioOutputDevices
      .mockResolvedValueOnce([{ id: "device-1", name: "Speakers", isDefault: true }])
      .mockRejectedValueOnce(new Error("enumeration failed"));
    render(<App />);

    const selector = await screen.findByRole("combobox", { name: "Audio output device" });
    await waitFor(() => expect(screen.getByRole("option", { name: /Speakers/ })).toBeVisible());
    await userEvent.click(screen.getByRole("button", { name: "Refresh output devices" }));

    expect(await screen.findByText(/unexpected error occurred while listing/i)).toBeVisible();
    expect(selector).toContainElement(screen.getByRole("option", { name: /Speakers/ }));
  });

  it("keeps the seek preview visible while the seek command is pending", async () => {
    mocks.getPlaybackState.mockResolvedValue(playing(1));
    const seek = deferred<PlaybackSnapshot>();
    mocks.seekAudioPlayback.mockReturnValue(seek.promise);
    render(<App />);

    const slider = await screen.findByRole("slider", { name: "Playback position" });
    await waitFor(() => expect(slider).toBeEnabled());
    fireEvent.change(slider, { target: { value: "7000" } });
    fireEvent.pointerUp(slider);

    expect(mocks.seekAudioPlayback).toHaveBeenCalledWith(7_000);
    expect(slider).toBeDisabled();
    expect(slider).toHaveValue("7000");
    expect(screen.getByText("0:07")).toBeInTheDocument();

    seek.resolve(playingAt(2, 7_250));
    await waitFor(() => expect(slider).toHaveValue("7250"));
    expect(slider).toBeEnabled();
  });

  it("rolls a failed seek back to the refreshed authoritative position", async () => {
    mocks.getPlaybackState
      .mockResolvedValueOnce(playing(1))
      .mockResolvedValueOnce(playingAt(3, 1_300));
    mocks.seekAudioPlayback.mockRejectedValue(new Error("seek failed"));
    render(<App />);

    const slider = await screen.findByRole("slider", { name: "Playback position" });
    await waitFor(() => expect(slider).toBeEnabled());
    fireEvent.change(slider, { target: { value: "7000" } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(slider).toHaveValue("1300"));
    expect(slider).toBeEnabled();
    expect(mocks.getPlaybackState).toHaveBeenCalledTimes(2);
    expect(screen.getByText("An unexpected playback error occurred.")).toBeVisible();
  });
});
