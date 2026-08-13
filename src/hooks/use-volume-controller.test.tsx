/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybackSnapshot } from "@/bindings";

const mocks = vi.hoisted(() => ({
  setPlaybackVolume: vi.fn(),
  muteAudioPlayback: vi.fn(),
  unmuteAudioPlayback: vi.fn(),
}));

vi.mock("@/api/audio-files", () => ({
  isPlaybackMuteError: vi.fn(() => false),
  isSetPlaybackVolumeError: vi.fn(() => false),
  muteAudioPlayback: mocks.muteAudioPlayback,
  setPlaybackVolume: mocks.setPlaybackVolume,
  unmuteAudioPlayback: mocks.unmuteAudioPlayback,
}));

import { useVolumeController } from "./use-volume-controller";

const file = { path: "C:/track.flac", fileName: "track.flac", extension: "flac" };

function playing(
  revision: number,
  volume: number,
): Extract<PlaybackSnapshot, { status: "playing" }> {
  return {
    status: "playing",
    revision,
    file,
    playbackId: "1",
    positionMs: 1_000,
    durationMs: 10_000,
    volume,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    outputDevice: { id: "default", name: "Speakers" },
    channelConversion: "none",
    sourceSampleRate: 44_100,
    outputSampleRate: 44_100,
    resamplingActive: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Harness({
  playback,
  applySnapshot,
  refreshAuthoritativeSnapshot,
}: {
  playback: PlaybackSnapshot;
  applySnapshot: (snapshot: PlaybackSnapshot) => boolean;
  refreshAuthoritativeSnapshot: () => Promise<void>;
}) {
  const controller = useVolumeController({
    playback,
    connection: "ready",
    applySnapshot,
    refreshAuthoritativeSnapshot,
    dispatchPlaybackUi: vi.fn(),
  });
  return (
    <>
      <input
        aria-label="volume"
        type="range"
        value={controller.volumeValue}
        disabled={false}
        onChange={(event) => controller.onVolumeChange(Number(event.currentTarget.value))}
        onPointerDown={controller.onVolumePointerDown}
        onPointerUp={(event) => controller.onVolumeCommit(Number(event.currentTarget.value))}
        onPointerCancel={controller.onVolumePointerCancel}
      />
      <button type="button" onClick={controller.onVolumeButtonPress}>
        mute
      </button>
    </>
  );
}

describe("useVolumeController", () => {
  let playback: PlaybackSnapshot;
  let applySnapshot: ReturnType<typeof vi.fn<(snapshot: PlaybackSnapshot) => boolean>>;
  let refreshAuthoritativeSnapshot: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    playback = playing(1, 0.5);
    applySnapshot = vi.fn<(snapshot: PlaybackSnapshot) => boolean>(() => true);
    refreshAuthoritativeSnapshot = vi.fn<() => Promise<void>>(async () => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderHarness(snapshot = playback) {
    return render(
      <Harness
        playback={snapshot}
        applySnapshot={applySnapshot}
        refreshAuthoritativeSnapshot={refreshAuthoritativeSnapshot}
      />,
    );
  }

  it("coalesces live updates to one latest queued value", async () => {
    const first = deferred<PlaybackSnapshot>();
    const second = deferred<PlaybackSnapshot>();
    mocks.setPlaybackVolume.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });

    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.change(volume, { target: { value: "70" } });
    fireEvent.change(volume, { target: { value: "80" } });
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledTimes(1));

    first.resolve(playing(2, 0.6));
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledTimes(2));
    expect(mocks.setPlaybackVolume).toHaveBeenLastCalledWith(0.8);
    expect(volume).toHaveValue("80");

    fireEvent.pointerUp(volume);
    second.resolve(playing(3, 0.8));
    await waitFor(() => expect(volume).toHaveValue("80"));
  });

  it("keeps the latest preview through stale responses and newer events", async () => {
    const first = deferred<PlaybackSnapshot>();
    mocks.setPlaybackVolume.mockReturnValue(first.promise);
    const view = renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });
    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.change(volume, { target: { value: "80" } });

    view.rerender(
      <Harness
        playback={playing(2, 0.6)}
        applySnapshot={applySnapshot}
        refreshAuthoritativeSnapshot={refreshAuthoritativeSnapshot}
      />,
    );
    expect(screen.getByRole("slider", { name: "volume" })).toHaveValue("80");
    first.resolve(playing(3, 0.6));
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("slider", { name: "volume" })).toHaveValue("80");
  });

  it("removes an obsolete queue entry when returning to the in-flight value", async () => {
    const first = deferred<PlaybackSnapshot>();
    mocks.setPlaybackVolume.mockReturnValue(first.promise);
    renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });
    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.change(volume, { target: { value: "80" } });
    fireEvent.change(volume, { target: { value: "60" } });

    first.resolve(playing(2, 0.6));
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledTimes(1));
  });

  it("sends a queued return to the authoritative value after the in-flight request", async () => {
    const first = deferred<PlaybackSnapshot>();
    const rollback = deferred<PlaybackSnapshot>();
    mocks.setPlaybackVolume
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(rollback.promise);
    renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });

    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.change(volume, { target: { value: "50" } });
    first.resolve(playing(2, 0.6));

    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledTimes(2));
    expect(mocks.setPlaybackVolume).toHaveBeenLastCalledWith(0.5);
    rollback.resolve(playing(3, 0.5));
  });

  it("restores the pointer interaction start value on cancellation", async () => {
    const first = deferred<PlaybackSnapshot>();
    const rollback = deferred<PlaybackSnapshot>();
    mocks.setPlaybackVolume
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(rollback.promise);
    renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });
    fireEvent.pointerDown(volume);
    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.pointerCancel(volume);
    expect(mocks.setPlaybackVolume).toHaveBeenCalledWith(0.6);

    first.resolve(playing(2, 0.6));
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledWith(0.5));
    expect(volume).toHaveValue("50");
    rollback.resolve(playing(3, 0.5));
    await waitFor(() => expect(volume).toHaveValue("50"));
  });

  it("stops a failed interaction without retrying queued or later values", async () => {
    const first = deferred<PlaybackSnapshot>();
    mocks.setPlaybackVolume.mockReturnValue(first.promise);
    renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });
    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.change(volume, { target: { value: "80" } });
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledTimes(1));
    await act(async () => {
      first.reject(new Error("volume failed"));
      await Promise.resolve();
    });
    await waitFor(() => expect(refreshAuthoritativeSnapshot).toHaveBeenCalledOnce());
    fireEvent.change(volume, { target: { value: "70" } });
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledTimes(2));
  });

  it("serializes mute with live volume updates", async () => {
    const volumeRequest = deferred<PlaybackSnapshot>();
    const muteRequest = deferred<PlaybackSnapshot>();
    mocks.setPlaybackVolume.mockReturnValue(volumeRequest.promise);
    mocks.muteAudioPlayback.mockReturnValue(muteRequest.promise);
    renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });
    const mute = screen.getByRole("button", { name: "mute" });
    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.click(mute);
    expect(mocks.muteAudioPlayback).not.toHaveBeenCalled();

    volumeRequest.resolve(playing(2, 0.6));
    await waitFor(() => expect(mute).toBeEnabled());
    fireEvent.click(mute);
    expect(volume).toBeEnabled();
    muteRequest.resolve(playing(3, 0.6));
    await waitFor(() => expect(volume).toBeEnabled());
  });

  it("returns to idle after commit so later authoritative snapshots control the slider", async () => {
    mocks.setPlaybackVolume.mockResolvedValue(playing(2, 0.6));
    const view = renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });

    fireEvent.pointerDown(volume);
    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.pointerUp(volume, { target: { value: "60" } });
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledWith(0.6));

    view.rerender(
      <Harness
        playback={playing(3, 0.2)}
        applySnapshot={applySnapshot}
        refreshAuthoritativeSnapshot={refreshAuthoritativeSnapshot}
      />,
    );
    await waitFor(() => expect(screen.getByRole("slider", { name: "volume" })).toHaveValue("20"));
  });

  it("unmutes after an in-flight mute when the slider requests audible output", async () => {
    const muteRequest = deferred<PlaybackSnapshot>();
    const volumeRequest = deferred<PlaybackSnapshot>();
    mocks.muteAudioPlayback.mockReturnValueOnce(muteRequest.promise);
    mocks.setPlaybackVolume.mockReturnValueOnce(volumeRequest.promise);
    mocks.unmuteAudioPlayback.mockResolvedValue(playing(4, 0.7));
    renderHarness();
    const volume = screen.getByRole("slider", { name: "volume" });
    const mute = screen.getByRole("button", { name: "mute" });

    fireEvent.click(mute);
    await waitFor(() => expect(mocks.muteAudioPlayback).toHaveBeenCalledOnce());
    fireEvent.change(volume, { target: { value: "70" } });

    muteRequest.resolve({ ...playing(2, 0.5), muted: true });
    await waitFor(() => expect(mocks.setPlaybackVolume).toHaveBeenCalledWith(0.7));
    expect(mocks.unmuteAudioPlayback).not.toHaveBeenCalled();
    volumeRequest.resolve(playing(3, 0.7));
    await waitFor(() => expect(mocks.unmuteAudioPlayback).toHaveBeenCalledOnce());
  });
});
