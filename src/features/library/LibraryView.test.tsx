/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryAlbumSummary } from "@/bindings";

const album: LibraryAlbumSummary = {
  id: "album-1",
  title: "Album title",
  albumArtist: "Album artist",
  artwork: null,
};

vi.mock("@/api/library", () => ({
  getLibraryStatus: vi.fn(async () => ({ indexing: false })),
  listLibraryRoots: vi.fn(async () => [{ id: "root-1" }]),
}));
vi.mock("./use-album-query", () => ({
  useAlbumQuery: () => ({
    items: [album],
    nextAfterId: null,
    loading: false,
    error: null,
    retry: vi.fn(),
    loadNext: vi.fn(),
  }),
}));
vi.mock("./use-track-query", () => ({
  useTrackQuery: () => ({
    items: [],
    nextAfterId: null,
    loading: false,
    error: null,
    retry: vi.fn(),
    loadNext: vi.fn(),
  }),
}));
vi.mock("./AlbumsView", () => ({
  AlbumsView: ({ onOpen }: { onOpen: (album: LibraryAlbumSummary) => void }) => (
    <button type="button" data-album-id={album.id} onClick={() => onOpen(album)}>
      Open album
    </button>
  ),
}));
vi.mock("./AlbumDetailView", () => ({
  AlbumDetailView: ({ onBack }: { onBack: () => void }) => (
    <button type="button" className="album-detail__back" onClick={onBack}>
      Back
    </button>
  ),
}));
vi.mock("@/hooks/use-scroll-region", async () => {
  const { useCallback, useState } = await import("react");
  return {
    useScrollRegion: () => {
      const [viewport, setViewport] = useState<HTMLElement | null>(null);
      return {
        element: viewport,
        setViewportElement: setViewport,
        setContentElement: vi.fn(),
        scrollToPosition: useCallback(
          (top: number) => {
            if (viewport) viewport.scrollTop = top;
          },
          [viewport],
        ),
        scrollToElement: vi.fn(),
        cancel: vi.fn(),
      };
    },
  };
});

import { LibraryView } from "./LibraryView";

function renderLibrary() {
  return render(
    <LibraryView
      onOpenSettings={vi.fn()}
      onPlayTrack={vi.fn()}
      onPlayAlbum={vi.fn()}
      onPlayAlbumTrack={vi.fn()}
      activeTrackId={null}
      playbackStatus="stopped"
      playbackAvailable
    />,
  );
}

describe("LibraryView scroll-surface ownership", () => {
  afterEach(cleanup);

  it("does not mutate the exiting browser when detail mounts at its own origin", () => {
    renderLibrary();
    const browser = document.querySelector<HTMLElement>('[data-library-surface="browser"]');
    expect(browser).not.toBeNull();
    if (!browser) return;
    browser.scrollTop = 240;

    fireEvent.click(screen.getByRole("button", { name: "Open album" }));

    const detail = document.querySelector<HTMLElement>('[data-library-surface="detail"]');
    expect(detail).not.toBeNull();
    expect(detail?.scrollTop).toBe(0);
    expect(browser.scrollTop).toBe(240);
  });

  it("restores a newly mounted browser without moving the exiting detail", () => {
    renderLibrary();
    const firstBrowser = document.querySelector<HTMLElement>('[data-library-surface="browser"]');
    expect(firstBrowser).not.toBeNull();
    if (!firstBrowser) return;
    firstBrowser.scrollTop = 180;
    fireEvent.click(screen.getByRole("button", { name: "Open album" }));

    const detail = document.querySelector<HTMLElement>('[data-library-surface="detail"]');
    expect(detail).not.toBeNull();
    if (!detail) return;
    detail.scrollTop = 72;
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    const browsers = document.querySelectorAll<HTMLElement>('[data-library-surface="browser"]');
    const restored = browsers[browsers.length - 1];
    expect(restored).toBeDefined();
    expect(restored?.scrollTop).toBe(180);
    expect(detail.scrollTop).toBe(72);
  });
});
