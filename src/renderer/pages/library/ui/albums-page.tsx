import { AlbumTile, albumSortOptions } from "@/renderer/entities/library";
import { MediaGrid, MediaGridItem, useSortFlip } from "@/renderer/shared/ui/media-grid";
import { useLibraryCatalog } from "../model/use-library-catalog";
import { useLibraryView } from "../model/use-library-view";
import { sortIndexLetter } from "@/renderer/shared/lib/sort-index";
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
  const flip = useSortFlip(`${view.sortKey}:${view.direction}`);

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
      indexFor={(album) =>
        view.sortKey === "year"
          ? (album.year?.toString() ?? "#")
          : sortIndexLetter(view.sortKey === "artist" ? album.key.albumArtist : album.key.title)
      }
    >
      {(albums) => (
        <MediaGrid artworkAt={(index) => albums[index]?.artwork}>
          {albums.map((album, index) => (
            <MediaGridItem
              key={`${album.key.albumArtist}\u0000${album.key.title}`}
              index={index}
              flip={flip}
            >
              <AlbumTile album={album} />
            </MediaGridItem>
          ))}
        </MediaGrid>
      )}
    </LibraryWorkspace>
  );
}
