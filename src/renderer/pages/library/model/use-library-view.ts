import { useNavigate, useSearch } from "@tanstack/react-router";
import type {
  LibraryAlbumArtistSortKey,
  LibraryAlbumSortKey,
  LibraryCatalogRequest,
  LibrarySortDirection,
  LibraryTrackSortKey,
} from "@/renderer/entities/library";
import { toggleSortDirection } from "@/renderer/entities/library";

export type LibraryPresentation = "albums" | "albumArtists" | "tracks";

type SortKeyOf = {
  albums: LibraryAlbumSortKey;
  albumArtists: LibraryAlbumArtistSortKey;
  tracks: LibraryTrackSortKey;
};

/** Where each presentation keeps its own filter and sort in the URL search. */
const presentationSearch = {
  albums: {
    path: "/library/albums",
    filter: "albumsFilter",
    sort: "albumsSort",
    direction: "albumsDirection",
  },
  albumArtists: {
    path: "/library/album-artists",
    filter: "artistsFilter",
    sort: "artistsSort",
    direction: "artistsDirection",
  },
  tracks: {
    path: "/library/tracks",
    filter: "tracksFilter",
    sort: "tracksSort",
    direction: "tracksDirection",
  },
} as const;

/** Reads and updates one presentation's filter and sort, independent of its peers. */
export function useLibraryView<Presentation extends LibraryPresentation>(
  presentation: Presentation,
) {
  const search = useSearch({ from: "/library" });
  const navigate = useNavigate();
  const names = presentationSearch[presentation];
  const filter = search[names.filter];
  // The search schema is built from the same key sets, so this key belongs to `presentation`.
  const sortKey = search[names.sort] as SortKeyOf[Presentation];
  const direction = search[names.direction];

  const update = (values: Record<string, string>) =>
    navigate({
      to: names.path,
      replace: true,
      search: (previous) => ({ ...previous, ...values }),
    });

  return {
    request: { presentation, filter, sortKey, direction } as Extract<
      LibraryCatalogRequest,
      { presentation: Presentation }
    >,
    filter,
    sortKey,
    direction,
    /** Identifies the filter and sort so views can reset scroll when it changes. */
    stateKey: `${filter}\u0000${sortKey}\u0000${direction}`,
    setFilter: (next: string) => update({ [names.filter]: next }),
    setSort: (key: SortKeyOf[Presentation], nextDirection: LibrarySortDirection = "ascending") =>
      update({ [names.sort]: key, [names.direction]: nextDirection }),
    toggleDirection: () => update({ [names.direction]: toggleSortDirection(direction) }),
  };
}
