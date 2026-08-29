import { useMemo } from "react";
import type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumSummary,
} from "@/bindings";
import { useScrollRegion } from "@/hooks/use-scroll-region";
import { AlbumDetailView } from "./AlbumDetailView";
import { AlbumArtistDetailView } from "./AlbumArtistsView";
import { useAlbumDetailQuery } from "./use-album-detail-query";
import { useAlbumArtistDetailQuery } from "./use-album-artist-detail-query";
import {
  libraryRetentionKey,
  useLibraryRuntime,
  useLibraryWorkspace,
  type LibraryNavigationFrame,
} from "./LibraryWorkspace";
import type { LibraryViewProps } from "./library-view-types";

export function AlbumDetailSurface({
  frame,
  onBack,
  ...props
}: LibraryViewProps & { frame: LibraryNavigationFrame; onBack: () => void }) {
  const { client, scrollRegistry, queryRetention } = useLibraryRuntime();
  const { setViewportElement } = useScrollRegion(
    undefined,
    useMemo(
      () => ({ key: libraryRetentionKey.frame(frame.id), registry: scrollRegistry }),
      [frame.id, scrollRegistry],
    ),
  );
  const retention = useMemo(
    () => ({ key: libraryRetentionKey.frame(frame.id), registry: queryRetention }),
    [frame.id, queryRetention],
  );
  return (
    <div
      ref={setViewportElement}
      className="library-scroll-surface"
      data-library-surface="detail"
      data-scroll-region
    >
      <div>
        <AlbumDetailSurfaceContent
          {...props}
          album={frame.summary as LibraryAlbumSummary}
          client={client}
          retention={{ retention }}
          refreshKey={props.libraryRefreshKey ?? 0}
          onBack={onBack}
        />
      </div>
    </div>
  );
}
function AlbumDetailSurfaceContent({
  album,
  client,
  retention,
  refreshKey,
  onBack,
  ...props
}: LibraryViewProps & {
  album: LibraryAlbumSummary;
  client: import("./LibraryWorkspace").LibraryBrowseClient;
  retention: import("./use-paged-library-query").PagedLibraryQueryOptions;
  refreshKey: number;
  onBack: () => void;
}) {
  const { openAlbumArtist } = useLibraryWorkspace();
  const query = useAlbumDetailQuery(album.key, refreshKey, true, client, retention);
  return (
    <AlbumDetailView
      {...props}
      album={album}
      refreshKey={refreshKey}
      onBack={onBack}
      query={query}
      onOpenAlbumArtist={(key) => void openAlbumArtist(key)}
    />
  );
}
export function AlbumArtistDetailSurface({
  frame,
  onBack,
  ...props
}: LibraryViewProps & { frame: LibraryNavigationFrame; onBack: () => void }) {
  const { client, scrollRegistry, queryRetention } = useLibraryRuntime();
  const { element, setViewportElement } = useScrollRegion(
    undefined,
    useMemo(
      () => ({ key: libraryRetentionKey.frame(frame.id), registry: scrollRegistry }),
      [frame.id, scrollRegistry],
    ),
  );
  const artistKey = frame.key as LibraryAlbumArtistKey;
  const detail = useAlbumArtistDetailQuery(
    artistKey,
    frame.summary as LibraryAlbumArtistSummary | undefined,
    props.libraryRefreshKey ?? 0,
    client,
    { retention: { key: libraryRetentionKey.frame(frame.id), registry: queryRetention } },
  );
  const { openAlbum } = useLibraryWorkspace();
  return (
    <div
      ref={setViewportElement}
      className="library-scroll-surface"
      data-library-surface="artist-detail"
      data-scroll-region
    >
      <div>
        <AlbumArtistDetailView
          artist={detail.summary}
          artistKey={artistKey}
          summaryLoading={detail.summaryLoading}
          summaryError={detail.summaryError}
          onRetrySummary={detail.retrySummary}
          scrollRoot={element}
          onBack={onBack}
          onOpenAlbum={openAlbum}
          query={detail.albums}
        />
      </div>
    </div>
  );
}
