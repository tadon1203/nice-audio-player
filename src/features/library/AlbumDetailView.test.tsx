/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtworkRef, LibraryAlbumSummary, LibraryAlbumTrackSummary } from "@/bindings";
import { usesCharacterTitle } from "./library-title-presentation";

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
  key: { title: "Album title", albumArtist: "Album artist" },
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

function renderDetail({
  items = [track()],
  nextOffset = null,
  playbackAvailable = true,
  firstPlayableTrackId = items[0]?.id ?? null,
  summary = album,
}: {
  items?: LibraryAlbumTrackSummary[];
  nextOffset?: number | null;
  playbackAvailable?: boolean;
  firstPlayableTrackId?: string | null;
  summary?: LibraryAlbumSummary;
} = {}) {
  const onPlayTrack = vi.fn();
  const onPlayAlbum = vi.fn();
  const loadNext = vi.fn();
  mocks.useAlbumDetailQuery.mockReturnValue({
    details: {
      value: {
        summary,
        date: "2000-09-27T09:00:00",
        trackCount: items.length,
        durationMs: 272_000,
        firstPlayableTrackId,
      },
      loading: false,
      error: null,
      retry: vi.fn(),
    },
    tracks: {
      items,
      error: null,
      loading: false,
      nextOffset,
      loadingNext: false,
      retry: vi.fn(),
      loadNext,
    },
  });
  render(
    <AlbumDetailView
      album={album}
      refreshKey={0}
      playbackAvailable={playbackAvailable}
      onBack={vi.fn()}
      onPlayAlbumTrack={(_albumId, trackId) => onPlayTrack(trackId)}
      onPlayAlbum={onPlayAlbum}
      activeTrackId={null}
      playbackStatus="stopped"
    />,
  );
  return { loadNext, onPlayTrack, onPlayAlbum };
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
    expect(document.querySelector('[data-region="album-detail-artwork"] img')).toHaveAttribute(
      "src",
      artworkUrl,
    );
  });

  it("keeps Zodiak exclusive to Latin media titles and avoids mixed-script fallback", () => {
    renderDetail();
    expect(usesCharacterTitle("Album title")).toBe(true);
    cleanup();

    renderDetail({ summary: { ...album, key: { ...album.key, title: "夜のアルバム Album" } } });
    expect(usesCharacterTitle("夜のアルバム Album")).toBe(false);
  });

  it("plays the album and clicked track, formats the date, and omits matching artists", () => {
    const { onPlayTrack, onPlayAlbum } = renderDetail({
      items: [
        track(),
        track({ id: "track-2", title: "Guest track", artist: "Guest artist", trackNumber: 2 }),
      ],
    });
    expect(screen.getByText("2000 · 2 tracks · 4:32")).toBeInTheDocument();
    expect(screen.queryByText("Album artist", { selector: "small" })).not.toBeInTheDocument();
    expect(screen.getByText("Guest artist")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play album" }));
    fireEvent.click(screen.getByRole("button", { name: "Play Guest track by Guest artist" }));
    expect(onPlayAlbum).toHaveBeenCalledWith(album.key);
    expect(onPlayTrack).toHaveBeenCalledWith("track-2");
  });

  it("hides the disc heading but keeps the track number for a single-track album", () => {
    renderDetail({ items: [track()] });
    expect(screen.queryByRole("heading", { name: "Disc 1" })).not.toBeInTheDocument();
    expect(
      screen.getByText("1", { selector: '[data-slot="album-track-number"]' }),
    ).toBeInTheDocument();
    expect(screen.getByText("Track title")).toBeInTheDocument();
    expect(screen.getByText("4:32")).toBeInTheDocument();
  });

  it("keeps the disc heading and track number for multi-track albums", () => {
    renderDetail({ items: [track(), track({ id: "track-2", trackNumber: 1, discNumber: 2 })] });
    expect(screen.getByRole("heading", { name: "Disc 1" })).toBeInTheDocument();
    expect(screen.getAllByText("1", { selector: '[data-slot="album-track-number"]' })).toHaveLength(
      2,
    );
  });

  it("exposes album and load-more actions", () => {
    const { loadNext, onPlayAlbum } = renderDetail({ nextOffset: 20 });
    const playAlbum = screen.getByRole("button", { name: "Play album" });
    const loadMore = screen.getByRole("button", { name: "Load more" });

    expect(playAlbum).toBeEnabled();
    expect(loadMore).toBeEnabled();
    fireEvent.click(playAlbum);
    fireEvent.click(loadMore);
    expect(onPlayAlbum).toHaveBeenCalledWith(album.key);
    expect(loadNext).toHaveBeenCalledOnce();
  });

  it("preserves the play-album disabled condition", () => {
    renderDetail({ playbackAvailable: false });
    expect(screen.getByRole("button", { name: "Play album" })).toBeDisabled();
  });

  it("disables play album when the detail has no playable track", () => {
    renderDetail({ firstPlayableTrackId: null });
    expect(screen.getByRole("button", { name: "Play album" })).toBeDisabled();
  });
});
