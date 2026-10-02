import { QueryClient, QueryObserver } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import { applyWaveformEvent, waveformQueryOptions } from "./waveform";

const getPlaybackWaveform = vi.fn();
vi.mock("$lib/native", () => ({ requireNative: () => ({ getPlaybackWaveform }) }));

const waveform = { playbackId: "p1", peaks: [1], rms: [1] };

describe("applyWaveformEvent", () => {
  it("refetches a waveform whose first answer, 'still analyzing', is still on its way", async () => {
    const client = new QueryClient();
    let answerFirst!: (value: null) => void;
    getPlaybackWaveform
      .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValue(waveform);
    const observer = new QueryObserver(client, waveformQueryOptions("p1"));
    const stop = observer.subscribe(() => undefined);

    // The backend finished analyzing while its "not yet" answer was still in flight.
    applyWaveformEvent(client, { event: "waveformReady", payload: { playbackId: "p1" } });
    answerFirst(null);

    await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(waveform));
    stop();
  });
});
