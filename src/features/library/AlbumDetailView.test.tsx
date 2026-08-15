/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtworkRef, LibraryAlbumSummary, LibraryAlbumTrackSummary } from "@/bindings";

const artworkUrl = "asset://album-art.jpg";
const mocks = vi.hoisted(() => ({
  useAlbumDetailQuery: vi.fn(),
  useLibraryArtworkUrl: vi.fn<() => string | null>(() => artworkUrl),
}));

vi.mock("./use-album-detail-query", () => ({ useAlbumDetailQuery: mocks.useAlbumDetailQuery }));
vi.mock("./LibraryArtwork", () => ({
  useLibraryArtworkUrl: mocks.useLibraryArtworkUrl,
  LibraryArtwork: ({
    className,
    resolvedUrl,
  }: {
    className?: string;
    resolvedUrl?: string | null;
  }) =>
    resolvedUrl ? (
      <img className={className} src={resolvedUrl} alt="" />
    ) : (
      <span className={className} />
    ),
}));

import { AlbumDetailView } from "./AlbumDetailView";

const artwork: ArtworkRef = { contentHash: "hash", mimeType: "jpeg", relativePath: "cover.jpg" };
const album: LibraryAlbumSummary = {
  id: "album-1",
  title: "Album title",
  albumArtist: "Album artist",
  artwork,
};
const track = (overrides: Partial<LibraryAlbumTrackSummary> = {}): LibraryAlbumTrackSummary => ({
  id: "track-1",
  title: "Track title",
  artist: "Album artist",
  trackNumber: 1,
  discNumber: 1,
  durationMs: 272_000,
  availability: "available",
  playable: true,
  ...overrides,
});

function renderDetail(items = [track()]) {
  const onPlayTrack = vi.fn();
  mocks.useAlbumDetailQuery.mockReturnValue({
    details: {
      summary: album,
      date: "2000-09-27T09:00:00",
      trackCount: items.length,
      durationMs: 272_000,
      firstPlayableTrackId: items[0]?.id ?? null,
    },
    items,
    error: null,
    loading: false,
    nextOffset: null,
    loadingNext: false,
    retry: vi.fn(),
    loadNext: vi.fn(),
  });
  render(
    <AlbumDetailView
      album={album}
      refreshKey={0}
      playbackAvailable
      onBack={vi.fn()}
      onPlayTrack={onPlayTrack}
      scrollElement={null}
    />,
  );
  return onPlayTrack;
}

describe("AlbumDetailView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useLibraryArtworkUrl.mockImplementation(() => artworkUrl);
  });

  it("renders only the foreground artwork", () => {
    renderDetail();
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelector(".album-detail__artwork")).toHaveAttribute("src", artworkUrl);
  });

  it("plays the album and clicked track, formats the date, and omits matching artists", () => {
    const onPlayTrack = renderDetail([
      track(),
      track({ id: "track-2", title: "Guest track", artist: "Guest artist", trackNumber: 2 }),
    ]);
    expect(screen.getByText("2000 · 2 tracks · 4:32")).toBeInTheDocument();
    expect(screen.queryByText("Album artist", { selector: "small" })).not.toBeInTheDocument();
    expect(screen.getByText("Guest artist")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play album" }));
    fireEvent.click(screen.getByRole("button", { name: "Play Guest track by Guest artist" }));
    expect(onPlayTrack).toHaveBeenNthCalledWith(1, "track-1");
    expect(onPlayTrack).toHaveBeenNthCalledWith(2, "track-2");
  });

  it("hides the disc heading and track number for a single-track album", () => {
    renderDetail([track()]);
    expect(screen.queryByRole("heading", { name: "Disc 1" })).not.toBeInTheDocument();
    expect(screen.queryByText("1", { selector: ".type-numeric" })).not.toBeInTheDocument();
    expect(screen.getByText("Track title")).toBeInTheDocument();
    expect(screen.getByText("4:32")).toBeInTheDocument();
  });

  it("keeps the disc heading and track number for multi-track albums", () => {
    renderDetail([track(), track({ id: "track-2", trackNumber: 2 })]);
    expect(screen.getByRole("heading", { name: "Disc 1" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: ".type-numeric" })).toBeInTheDocument();
  });
});
