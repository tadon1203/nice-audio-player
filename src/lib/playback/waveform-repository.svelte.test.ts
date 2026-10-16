import { describe, expect, it, vi } from "vitest";
import type { PlaybackClient, PlaybackWaveform, Versioned } from "#lib/native";
import { WaveformRepository } from "./waveform-repository.svelte";

const waveform = (playbackId: string): PlaybackWaveform => ({
  playbackId,
  peaks: [0.5],
  rms: [0.2],
});

/** A client that answers only the waveform question; every other call would be a test bug. */
function fakeClient(answer: () => Promise<Versioned<PlaybackWaveform | null>>) {
  const waveformCall = vi.fn(answer);
  const client = { waveform: waveformCall } as unknown as PlaybackClient;
  return { client, waveformCall };
}

const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 0));

describe("WaveformRepository", () => {
  it("returns nothing and asks the Backend once for a new playback", async () => {
    const { client, waveformCall } = fakeClient(() =>
      Promise.resolve({ revision: 1, value: null }),
    );
    const repository = new WaveformRepository(client);
    expect(repository.forPlayback("1")).toBeNull();
    expect(repository.forPlayback("1")).toBeNull();
    await settle();
    expect(waveformCall).toHaveBeenCalledTimes(1);
  });

  it("returns the Waveform of its own playback once it is pushed", () => {
    const repository = new WaveformRepository(fakeClient(() => new Promise(() => {})).client);
    repository.accept({ revision: 1, value: waveform("1") });
    expect(repository.forPlayback("1")).toEqual(waveform("1"));
  });

  it("does not return a Waveform for another playback", () => {
    const repository = new WaveformRepository(fakeClient(() => new Promise(() => {})).client);
    repository.accept({ revision: 1, value: waveform("1") });
    expect(repository.forPlayback("2")).toBeNull();
  });

  it("keeps the newest Waveform and drops an older push", () => {
    const repository = new WaveformRepository(fakeClient(() => new Promise(() => {})).client);
    repository.accept({ revision: 2, value: waveform("1") });
    repository.accept({ revision: 1, value: { ...waveform("1"), peaks: [0.1] } });
    expect(repository.forPlayback("1")?.peaks).toEqual([0.5]);
  });

  it("takes the answer to its question, when it is newer than what it holds", async () => {
    const { client } = fakeClient(() => Promise.resolve({ revision: 3, value: waveform("1") }));
    const repository = new WaveformRepository(client);
    expect(repository.forPlayback("1")).toBeNull();
    await settle();
    expect(repository.forPlayback("1")).toEqual(waveform("1"));
  });
});
