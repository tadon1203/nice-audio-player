import { ArtistTile, albumArtistSortOptions } from "@/renderer/entities/library";
import { MediaGrid, MediaGridItem, useSortFlip } from "@/renderer/shared/ui/media-grid";
import { useLibraryCatalog } from "../model/use-library-catalog";
import { useLibraryView } from "../model/use-library-view";
import { sortIndexLetter } from "@/renderer/shared/lib/sort-index";
import { LibraryWorkspace } from "./library-workspace";

const meta = {
  title: "Album Artists",
  singular: "album artist",
  plural: "album artists",
  searchLabel: "Search album artists",
  searchPlaceholder: "Search album artists…",
};

export function AlbumArtistsPage() {
  const view = useLibraryView("albumArtists");
  const catalog = useLibraryCatalog(view.request);
  const flip = useSortFlip(`${view.sortKey}:${view.direction}`);

  return (
    <LibraryWorkspace
      meta={meta}
      scrollRestorationId="library-albumArtists"
      filter={view.filter}
      onFilterChange={(filter) => void view.setFilter(filter)}
      stateKey={view.stateKey}
      sort={{
        key: view.sortKey,
        direction: view.direction,
        options: albumArtistSortOptions,
        onKeyChange: (key) => void view.setSort(key),
        onToggleDirection: () => void view.toggleDirection(),
      }}
      catalog={catalog}
      indexFor={
        view.sortKey === "artist" ? (artist) => sortIndexLetter(artist.key.name) : undefined
      }
    >
      {(artists) => (
        <MediaGrid artworkAt={(index) => artists[index]?.artwork}>
          {artists.map((artist, index) => (
            <MediaGridItem key={artist.key.name} index={index} flip={flip}>
              <ArtistTile artist={artist} />
            </MediaGridItem>
          ))}
        </MediaGrid>
      )}
    </LibraryWorkspace>
  );
}
