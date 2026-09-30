import { useMemo, useState } from "react";
import { usePlaybackActions } from "@/renderer/entities/playback";
import { FactLine } from "@/renderer/shared/ui/fact-line";
import {
  useElementScrollRestoration,
  useNavigate,
  useLocation,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import {
  AlbumTile,
  artistArtworkLayoutId,
  artistAlbumSortOptions,
  artistNameLabel,
  fromNameSegment,
  toggleSortDirection,
  useAlbumArtist,
  useArtistAlbums,
  type LibraryAlbumArtistKey,
  type LibraryArtistAlbumSortKey,
  type LibrarySortDirection,
} from "@/renderer/entities/library";
import { formatCount } from "@/renderer/shared/lib/format";
import { useScrollTopOnChange } from "@/renderer/shared/lib/use-scroll-top-on-change";
import { BackLink } from "@/renderer/shared/ui/back-link";
import { CollectionSortControl } from "@/renderer/shared/ui/collection-sort-control";
import { SectionTitle } from "@/renderer/shared/ui/headings";
import { MediaGrid, MediaGridItem, useSortFlip } from "@/renderer/shared/ui/media-grid";
import { EmptyStatus } from "@/renderer/shared/ui/workspace-status";
import { MediaDetailsHeader } from "@/renderer/widgets/media-details-header";
import {
  MediaDetailsLayout,
  useMediaDetailsWorkspace,
} from "@/renderer/widgets/media-details-layout";

export function ArtistDetailsPage() {
  const params = useParams({ from: "/library/album-artists/$artistName" });
  const artistName = fromNameSegment(params.artistName);
  const key = useMemo<LibraryAlbumArtistKey>(() => ({ name: artistName }), [artistName]);
  const search = useSearch({ from: "/library" });
  const navigate = useNavigate({ from: "/library" });
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const openedArtwork = useLocation().state.artwork;
  const artworkLayoutId = artistArtworkLayoutId(artistName);
  const scrollRestorationId = `artist-${encodeURIComponent(artistName)}`;
  useElementScrollRestoration({ id: scrollRestorationId });
  const sortKey = search.artistAlbumsSort;
  const direction = search.artistAlbumsDirection;
  const workspace = useMediaDetailsWorkspace(
    useAlbumArtist(key),
    useArtistAlbums(key, sortKey, direction),
  );

  const flip = useSortFlip(`${sortKey}:${direction}`);
  const playback = usePlaybackActions();
  useScrollTopOnChange(viewport, `${sortKey}\u0000${direction}`);

  const setSort = (nextKey: LibraryArtistAlbumSortKey, nextDirection: LibrarySortDirection) =>
    navigate({
      to: ".",
      replace: true,
      search: (previous) => ({
        ...previous,
        artistAlbumsSort: nextKey,
        artistAlbumsDirection: nextDirection,
      }),
    });

  return (
    <MediaDetailsLayout
      scrollRestorationId={scrollRestorationId}
      viewportRef={setViewport}
      back={<BackLink to="/library/album-artists">Album Artists</BackLink>}
      loadingLabel="Reading artist…"
      loadingHeader={
        <MediaDetailsHeader
          title={artistNameLabel(artistName)}
          artwork={openedArtwork ?? null}
          artworkLayoutId={artworkLayoutId}
          round
        />
      }
      workspace={workspace}
    >
      {({ summary: artist, items: albums }) => (
        <>
          <MediaDetailsHeader
            title={artistNameLabel(artistName)}
            artwork={artist.artwork}
            artworkLayoutId={artworkLayoutId}
            round
          >
            <FactLine
              facts={[
                formatCount(artist.albumCount, "album"),
                formatCount(artist.trackCount, "track"),
              ]}
            />
          </MediaDetailsHeader>

          <section className="mt-10" aria-labelledby="artist-albums-title">
            <div className="mb-5 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <SectionTitle id="artist-albums-title">Albums</SectionTitle>
              <CollectionSortControl
                selectLabel="Sort artist albums"
                value={sortKey}
                options={artistAlbumSortOptions}
                direction={direction}
                onValueChange={(value) => void setSort(value, "ascending")}
                onToggleDirection={() => void setSort(sortKey, toggleSortDirection(direction))}
              />
            </div>

            {albums.length > 0 ? (
              <MediaGrid>
                {albums.map((album) => (
                  <MediaGridItem
                    key={`${album.key.albumArtist}\u0000${album.key.title}`}
                    flip={flip}
                  >
                    <AlbumTile
                      album={album}
                      showArtist={false}
                      parentArtist={artistName}
                      onPlay={(played) =>
                        void playback.startPlayback({ kind: "album", key: played.key }, null)
                      }
                    />
                  </MediaGridItem>
                ))}
              </MediaGrid>
            ) : (
              <EmptyStatus>No albums were indexed for this artist.</EmptyStatus>
            )}
          </section>
        </>
      )}
    </MediaDetailsLayout>
  );
}
