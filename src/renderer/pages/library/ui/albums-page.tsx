import { AlbumTile, albumSortOptions } from "@/renderer/entities/library";
import { usePlaybackActions } from "@/renderer/entities/playback";
import { VirtualMediaGrid } from "@/renderer/shared/ui/media-grid";
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
  const playback = usePlaybackActions();

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
      {(albums, scroll) => (
        <VirtualMediaGrid
          items={albums}
          scrollElement={scroll.viewport}
          initialOffset={scroll.initialOffset}
          itemKey={(album) => `${album.key.albumArtist}\u0000${album.key.title}`}
          artworkAt={(index) => albums[index]?.artwork}
          sortSignature={`${view.sortKey}:${view.direction}`}
          onTopIndexChange={scroll.onTopIndexChange}
          renderItem={(album) => (
            <AlbumTile
              album={album}
              onPlay={(played) =>
                void playback.startPlayback({ kind: "album", key: played.key }, null)
              }
            />
          )}
        />
      )}
    </LibraryWorkspace>
  );
}
