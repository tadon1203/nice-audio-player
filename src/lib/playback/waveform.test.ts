import { QueryClient, QueryObserver } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import { applyWaveform, waveformQueryOptions } from "./waveform";

const getPlaybackWaveform = vi.fn();
vi.mock("$lib/native", () => ({ requireNative: () => ({ getPlaybackWaveform }) }));

const waveform = (playbackId: string, revision = 1, rms = [1]) => ({
  revision,
  value: { playbackId, peaks: [1], rms },
});

function watch(client: QueryClient, playbackId: string) {
  const observer = new QueryObserver(client, waveformQueryOptions(playbackId));
  const stop = observer.subscribe(() => undefined);
  return { data: () => observer.getCurrentResult().data?.value ?? null, stop };
}

describe("waveform cache", () => {
  it("keeps a pushed waveform when the first answer, 'still analyzing', lands after it", async () => {
    const client = new QueryClient();
    let answerFirst!: (value: { revision: number; value: null }) => void;
    getPlaybackWaveform.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)));
    const watching = watch(client, "p1");

    applyWaveform(client, waveform("p1", 2));
    answerFirst({ revision: 1, value: null });

    await vi.waitFor(() => expect(watching.data()).toEqual(waveform("p1").value));
    watching.stop();
  });

  it("replaces a waveform with a refined one pushed later", async () => {
    const client = new QueryClient();
    getPlaybackWaveform.mockResolvedValueOnce(waveform("p1", 1));
    const watching = watch(client, "p1");
    await vi.waitFor(() => expect(watching.data()).toEqual(waveform("p1").value));

    const refined = waveform("p1", 2, [2]);
    applyWaveform(client, refined);

    expect(watching.data()).toEqual(refined.value);
    watching.stop();
  });

  it("keeps the newer waveform when an older one is pushed after it", async () => {
    const client = new QueryClient();
    getPlaybackWaveform.mockResolvedValueOnce(waveform("p1", 5, [5]));
    const watching = watch(client, "p1");
    await vi.waitFor(() => expect(watching.data()).toEqual(waveform("p1", 5, [5]).value));

    applyWaveform(client, waveform("p1", 4, [4]));

    expect(watching.data()).toEqual(waveform("p1", 5, [5]).value);
    watching.stop();
  });

  it("does not keep the answer for another playback under this one's key", async () => {
    const client = new QueryClient();
    getPlaybackWaveform.mockResolvedValueOnce(waveform("p2"));
    const watching = watch(client, "p1");

    await vi.waitFor(() => expect(getPlaybackWaveform).toHaveBeenCalled());
    await vi.waitFor(() => expect(watching.data()).toBeNull());
    watching.stop();
  });

  it("drops a waveform pushed for a playback nobody watches", () => {
    const client = new QueryClient();
    applyWaveform(client, waveform("p9"));
    expect(client.getQueryCache().getAll()).toEqual([]);
  });
});
