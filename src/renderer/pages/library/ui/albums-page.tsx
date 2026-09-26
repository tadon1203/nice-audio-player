import { AlbumTile, albumSortOptions } from "@/renderer/entities/library";
import { MediaGrid } from "@/renderer/shared/ui/media-grid";
import { useLibraryCatalog } from "../model/use-library-catalog";
import { useLibraryView } from "../model/use-library-view";
import { LibraryWorkspace } from "./library-workspace";

const meta = {
  title: "Albums",
  singular: "album",
  plural: "albums",
  searchLabel: "Search albums",
  searchPlaceholder: "Search albums…",
};

export function AlbumsPage() {
  const view = useLibraryView("albums");
  const catalog = useLibraryCatalog(view.request);

  return (
    <LibraryWorkspace
      meta={meta}
      scrollRestorationId="library-albums"
      filter={view.filter}
      onFilterChange={(filter) => void view.setFilter(filter)}
      stateKey={view.stateKey}
      sort={{
        key: view.sortKey,
        direction: view.direction,
        options: albumSortOptions,
        onKeyChange: (key) => void view.setSort(key),
        onToggleDirection: () => void view.toggleDirection(),
      }}
      catalog={catalog}
    >
      {(albums) => (
        <MediaGrid>
          {albums.map((album) => (
            <li key={`${album.key.albumArtist}\u0000${album.key.title}`}>
              <AlbumTile album={album} />
            </li>
          ))}
        </MediaGrid>
      )}
    </LibraryWorkspace>
  );
}
