/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LyricsResolution } from "@/bindings";

const api = vi.hoisted(() => ({ getLibraryTrackLyrics: vi.fn() }));
vi.mock("@/api/lyrics", () => ({
  getLibraryTrackLyrics: api.getLibraryTrackLyrics,
  isLyricsCommandError: () => false,
}));

import { useTrackLyrics } from "./use-track-lyrics";

const resolved = (trackId: string): LyricsResolution => ({
  status: "resolved",
  track_id: trackId,
  notice: null,
  document: { source: "sidecar", language: null, content: { kind: "plain", lines: ["Line"] } },
});

describe("useTrackLyrics", () => {
  it("keeps resolved state while the context is closing", async () => {
    api.getLibraryTrackLyrics.mockResolvedValueOnce(resolved("track-1"));
    const { result, rerender } = renderHook(({ active }) => useTrackLyrics("track-1", active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(result.current.state.kind).toBe("resolved"));
    rerender({ active: false });
    expect(result.current.state.kind).toBe("resolved");
  });

  it("ignores an older request after the track changes", async () => {
    let resolveFirst!: (value: LyricsResolution) => void;
    const first = new Promise<LyricsResolution>((resolve) => {
      resolveFirst = resolve;
    });
    api.getLibraryTrackLyrics.mockReturnValueOnce(first).mockResolvedValueOnce(resolved("track-2"));
    const { result, rerender } = renderHook(({ trackId }) => useTrackLyrics(trackId, true), {
      initialProps: { trackId: "track-1" },
    });
    rerender({ trackId: "track-2" });
    await waitFor(() => expect(result.current.state.trackId).toBe("track-2"));
    act(() => resolveFirst(resolved("track-1")));
    await waitFor(() => expect(result.current.state.trackId).toBe("track-2"));
    expect(result.current.state.kind).toBe("resolved");
  });
});
