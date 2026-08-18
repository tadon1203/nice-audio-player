/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";

const api = vi.hoisted(() => ({ seekAudioPlayback: vi.fn() }));

vi.mock("@/api/audio-files", () => ({
  isSeekAudioPlaybackError: () => false,
  seekAudioPlayback: api.seekAudioPlayback,
}));

import { useSeekController } from "./use-seek-controller";

const file: ValidatedAudioFile = {
  path: "C:/Music/test.flac",
  fileName: "test.flac",
  extension: "flac",
};
const playback: PlaybackSnapshot = {
  status: "playing",
  revision: 1,
  file,
  playbackId: "playback-1",
  positionMs: 500,
  durationMs: 10_000,
  volume: 1,
  muted: false,
  outputSelection: { kind: "systemDefault" },
  outputDevice: { id: "default", name: "Default" },
  channelConversion: "none",
  sourceSampleRate: 44_100,
  outputSampleRate: 44_100,
  resamplingActive: false,
  canGoPrevious: false,
  canGoNext: false,
};

describe("useSeekController", () => {
  it("publishes a receipt only after authoritative playback accepts a seek", async () => {
    api.seekAudioPlayback.mockResolvedValue({ ...playback, revision: 2, positionMs: 8_000 });
    const applySnapshot = vi.fn(() => true);
    const { result } = renderHook(() =>
      useSeekController({
        playback,
        connection: "ready",
        isTransportCommandPending: false,
        isOutputSelectionPending: false,
        applySnapshot,
        refreshAuthoritativeSnapshot: vi.fn(),
        dispatchPlaybackUi: vi.fn(),
      }),
    );

    await act(() => result.current.requestSeek(8_000));

    expect(applySnapshot).toHaveBeenCalledOnce();
    expect(result.current.acceptedSeek).toEqual({
      id: 1,
      playbackId: "playback-1",
      acceptedRevision: 2,
      positionMs: 8_000,
    });
  });
});
