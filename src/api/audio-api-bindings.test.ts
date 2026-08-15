import { describe, expect, it, vi } from "vitest";

const mockedCommands = vi.hoisted(() => ({
  validateAudioFile: vi.fn(),
  inspectAudioFile: vi.fn(),
  listAudioOutputDevices: vi.fn(),
  startAudioFile: vi.fn(),
  stopAudioPlayback: vi.fn(),
  pauseAudioPlayback: vi.fn(),
  resumeAudioPlayback: vi.fn(),
  seekAudioPlayback: vi.fn(),
  setPlaybackVolume: vi.fn(),
  muteAudioPlayback: vi.fn(),
  unmuteAudioPlayback: vi.fn(),
  getPlaybackState: vi.fn(),
  setAudioOutputSelection: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands: mockedCommands }));

import {
  isSetAudioOutputSelectionError,
  listAudioOutputDevices,
  setAudioOutputSelection,
} from "./audio-devices";
import {
  getPlaybackState,
  inspectAudioFile,
  pauseAudioPlayback,
  resumeAudioPlayback,
  seekAudioPlayback,
  setPlaybackVolume,
  muteAudioPlayback,
  unmuteAudioPlayback,
  startAudioFile,
  stopAudioPlayback,
  validateAudioFile,
} from "./audio-files";

const snapshot = {
  status: "stopped",
  revision: 1,
  file: null,
  volume: 1,
  muted: false,
  outputSelection: { kind: "systemDefault" },
  canGoPrevious: false,
  canGoNext: false,
} as const;

describe("frontend API command bindings", () => {
  it("delegates file and device commands with their existing arguments", async () => {
    mockedCommands.validateAudioFile.mockResolvedValue({
      path: "C:/track.flac",
      fileName: "track.flac",
      extension: "flac",
    });
    mockedCommands.inspectAudioFile.mockResolvedValue({
      codec: "flac",
      sampleRate: 44_100,
      channelCount: 2,
      durationMs: 1_000,
    });
    mockedCommands.listAudioOutputDevices.mockResolvedValue([]);

    await validateAudioFile("C:/track.flac");
    await inspectAudioFile("C:/track.flac");
    await listAudioOutputDevices();

    expect(mockedCommands.validateAudioFile).toHaveBeenCalledWith("C:/track.flac");
    expect(mockedCommands.inspectAudioFile).toHaveBeenCalledWith("C:/track.flac");
    expect(mockedCommands.listAudioOutputDevices).toHaveBeenCalledOnce();
  });

  it("rejects malformed file and device payloads at the frontend boundary", async () => {
    mockedCommands.validateAudioFile.mockResolvedValue({ path: "", fileName: "", extension: "" });
    mockedCommands.listAudioOutputDevices.mockResolvedValue([
      { id: "device-1", name: "Speakers", isDefault: "yes" },
    ]);

    await expect(validateAudioFile("C:/track.flac")).rejects.toThrow(
      "Invalid validated audio file payload.",
    );
    await expect(listAudioOutputDevices()).rejects.toThrow("Invalid audio output device payload.");
  });

  it("delegates every playback command and keeps snapshot validation", async () => {
    for (const command of [
      mockedCommands.startAudioFile,
      mockedCommands.stopAudioPlayback,
      mockedCommands.pauseAudioPlayback,
      mockedCommands.resumeAudioPlayback,
      mockedCommands.seekAudioPlayback,
      mockedCommands.setPlaybackVolume,
      mockedCommands.muteAudioPlayback,
      mockedCommands.unmuteAudioPlayback,
      mockedCommands.getPlaybackState,
      mockedCommands.setAudioOutputSelection,
    ]) {
      command.mockResolvedValue(snapshot);
    }

    await expect(startAudioFile("C:/track.flac")).resolves.toEqual(snapshot);
    await expect(stopAudioPlayback()).resolves.toEqual(snapshot);
    await expect(pauseAudioPlayback()).resolves.toEqual(snapshot);
    await expect(resumeAudioPlayback()).resolves.toEqual(snapshot);
    await expect(seekAudioPlayback(1_500)).resolves.toEqual(snapshot);
    await expect(setPlaybackVolume(0.5)).resolves.toEqual(snapshot);
    await expect(muteAudioPlayback()).resolves.toEqual(snapshot);
    await expect(unmuteAudioPlayback()).resolves.toEqual(snapshot);
    await expect(getPlaybackState()).resolves.toEqual(snapshot);
    await expect(setAudioOutputSelection({ kind: "systemDefault" })).resolves.toEqual(snapshot);

    expect(mockedCommands.startAudioFile).toHaveBeenCalledWith("C:/track.flac");
    expect(mockedCommands.stopAudioPlayback).toHaveBeenCalledOnce();
    expect(mockedCommands.pauseAudioPlayback).toHaveBeenCalledOnce();
    expect(mockedCommands.resumeAudioPlayback).toHaveBeenCalledOnce();
    expect(mockedCommands.seekAudioPlayback).toHaveBeenCalledWith(1_500);
    expect(mockedCommands.setPlaybackVolume).toHaveBeenCalledWith(0.5);
    expect(mockedCommands.muteAudioPlayback).toHaveBeenCalledOnce();
    expect(mockedCommands.unmuteAudioPlayback).toHaveBeenCalledOnce();
    expect(mockedCommands.getPlaybackState).toHaveBeenCalledOnce();
    expect(mockedCommands.setAudioOutputSelection).toHaveBeenCalledWith({ kind: "systemDefault" });
  });

  it("rejects invalid volume before invoking the generated command", async () => {
    mockedCommands.setPlaybackVolume.mockClear();
    for (const value of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(setPlaybackVolume(value)).rejects.toThrow();
    }
    expect(mockedCommands.setPlaybackVolume).not.toHaveBeenCalled();
  });

  it("validates and delegates output selection", async () => {
    mockedCommands.setAudioOutputSelection.mockResolvedValue(snapshot);
    await expect(
      setAudioOutputSelection({ kind: "device", deviceId: "device-1" }),
    ).resolves.toEqual(snapshot);
    expect(mockedCommands.setAudioOutputSelection).toHaveBeenCalledWith({
      kind: "device",
      deviceId: "device-1",
    });
    await expect(setAudioOutputSelection({ kind: "device", deviceId: "" })).rejects.toThrow();
    expect(isSetAudioOutputSelectionError({ code: "invalidDeviceId" })).toBe(true);
    expect(isSetAudioOutputSelectionError({ code: "unknown" })).toBe(false);
  });
});
