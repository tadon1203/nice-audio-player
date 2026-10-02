import { QueryClient, QueryObserver } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import { applyWaveformEvent, waveformQueryOptions } from "./waveform";

const getPlaybackWaveform = vi.fn();
vi.mock("$lib/native", () => ({ requireNative: () => ({ getPlaybackWaveform }) }));

const waveform = (playbackId: string) => ({ playbackId, peaks: [1], rms: [1] });
const pushed = (playbackId: string) =>
  ({ event: "waveformChanged", payload: waveform(playbackId) }) as const;

function watch(client: QueryClient, playbackId: string) {
  const observer = new QueryObserver(client, waveformQueryOptions(playbackId));
  const stop = observer.subscribe(() => undefined);
  return { data: () => observer.getCurrentResult().data, stop };
}

describe("waveform cache", () => {
  it("keeps a pushed waveform when the first answer, 'still analyzing', lands after it", async () => {
    const client = new QueryClient();
    let answerFirst!: (value: null) => void;
    getPlaybackWaveform.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)));
    const watching = watch(client, "p1");

    applyWaveformEvent(client, pushed("p1"));
    answerFirst(null);

    await vi.waitFor(() => expect(watching.data()).toEqual(waveform("p1")));
    watching.stop();
  });

  it("replaces a waveform with a refined one pushed later", async () => {
    const client = new QueryClient();
    getPlaybackWaveform.mockResolvedValueOnce(waveform("p1"));
    const watching = watch(client, "p1");
    await vi.waitFor(() => expect(watching.data()).toEqual(waveform("p1")));

    const refined = { ...waveform("p1"), rms: [2] };
    applyWaveformEvent(client, { event: "waveformChanged", payload: refined });

    expect(watching.data()).toEqual(refined);
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
    applyWaveformEvent(client, pushed("p9"));
    expect(client.getQueryCache().getAll()).toEqual([]);
  });
});
