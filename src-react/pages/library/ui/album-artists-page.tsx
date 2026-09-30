import { ArtistTile, albumArtistSortOptions } from "@/entities/library";
import { VirtualMediaGrid } from "@/shared/ui/media-grid";
import { useLibraryCatalog } from "../model/use-library-catalog";
import { useLibraryView } from "../model/use-library-view";
import { sortIndexLetter } from "@/shared/lib/sort-index";
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
      {(artists, scroll) => (
        <VirtualMediaGrid
          items={artists}
          scrollElement={scroll.viewport}
          initialOffset={scroll.initialOffset}
          itemKey={(artist) => artist.key.name}
          artworkAt={(index) => artists[index]?.artwork}
          sortSignature={`${view.sortKey}:${view.direction}`}
          onTopIndexChange={scroll.onTopIndexChange}
          renderItem={(artist) => <ArtistTile artist={artist} />}
        />
      )}
    </LibraryWorkspace>
  );
}
