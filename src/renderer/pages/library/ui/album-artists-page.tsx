import { ArtistTile, albumArtistSortOptions } from "@/renderer/entities/library";
import { MediaGrid } from "@/renderer/shared/ui/media-grid";
import { useLibraryCatalog } from "../model/use-library-catalog";
import { useLibraryView } from "../model/use-library-view";
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
    >
      {(artists) => (
        <MediaGrid>
          {artists.map((artist) => (
            <li key={artist.key.name}>
              <ArtistTile artist={artist} />
            </li>
          ))}
        </MediaGrid>
      )}
    </LibraryWorkspace>
  );
}
