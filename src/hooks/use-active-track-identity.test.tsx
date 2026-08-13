/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ArtworkRef, LibraryTrackSummary, ValidatedAudioFile } from "@/bindings";

const mocks = vi.hoisted(() => ({
  getLibraryTrackForPath: vi.fn(),
  resolveArtworkUrl: vi.fn(),
}));

vi.mock("@/api/library", () => ({ getLibraryTrackForPath: mocks.getLibraryTrackForPath }));
vi.mock("@/lib/artwork-url", () => ({ resolveArtworkUrl: mocks.resolveArtworkUrl }));

import { useActiveTrackIdentity } from "./use-active-track-identity";

const artwork: ArtworkRef = {
  contentHash: "a".repeat(64),
  mimeType: "jpeg",
  relativePath: `artwork/aa/${"a".repeat(64)}.jpg`,
};
const track = (title: string, withArtwork = false): LibraryTrackSummary => ({
  id: "1",
  title,
  artist: "Artist",
  artwork: withArtwork ? artwork : null,
  durationMs: 1_000,
  availability: "available",
  playable: true,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Harness({ file }: { file: ValidatedAudioFile | null }) {
  const identity = useActiveTrackIdentity(file);
  return (
    <output data-artwork-url={identity.artworkUrl ?? ""} data-loading={identity.artworkLoading}>
      {identity.title}
    </output>
  );
}

describe("useActiveTrackIdentity", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses the path as the lookup key and rejects a late prior-track result", async () => {
    const first = deferred<LibraryTrackSummary | null>();
    const second = deferred<LibraryTrackSummary | null>();
    mocks.getLibraryTrackForPath
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const fileA = { path: "C:/Music/A.flac", fileName: "A.flac", extension: "flac" };
    const fileB = { path: "C:/Music/B.flac", fileName: "B.flac", extension: "flac" };
    mocks.resolveArtworkUrl.mockResolvedValue("asset://track-b");
    const { rerender } = render(<Harness file={fileA} />);
    rerender(<Harness file={{ ...fileA }} />);
    expect(mocks.getLibraryTrackForPath).toHaveBeenCalledTimes(1);
    rerender(<Harness file={fileB} />);

    await act(async () => second.resolve(track("Track B", true)));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Track B"));
    await act(async () => first.resolve(track("Track A", true)));

    expect(screen.getByRole("status")).toHaveTextContent("Track B");
    expect(mocks.resolveArtworkUrl).toHaveBeenCalledWith(artwork);
  });

  it("keeps the direct-file fallback when lookup or artwork URL resolution fails", async () => {
    mocks.getLibraryTrackForPath.mockRejectedValueOnce(new Error("unavailable"));
    const file = { path: "C:/Music/fallback.flac", fileName: "fallback.flac", extension: "flac" };
    render(<Harness file={file} />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("fallback"));
    expect(screen.getByRole("status")).toHaveAttribute("data-artwork-url", "");
  });

  it("keeps indexed metadata when only artwork URL resolution fails", async () => {
    mocks.getLibraryTrackForPath.mockResolvedValueOnce(track("Indexed track", true));
    mocks.resolveArtworkUrl.mockRejectedValueOnce(new Error("asset unavailable"));
    render(
      <Harness
        file={{ path: "C:/Music/indexed.flac", fileName: "indexed.flac", extension: "flac" }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Indexed track"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveAttribute("data-loading", "false"),
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-artwork-url", "");
  });
});
