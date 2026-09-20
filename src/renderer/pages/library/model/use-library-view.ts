import { useNavigate, useSearch } from "@tanstack/react-router";
import type {
  LibraryAlbumArtistSortKey,
  LibraryAlbumSortKey,
  LibraryCatalogRequest,
  LibrarySortDirection,
  LibraryTrackSortKey,
} from "@/renderer/entities/library";

export type LibraryPresentation = "albums" | "albumArtists" | "tracks";

const presentationPath = {
  albums: "/library/albums",
  albumArtists: "/library/album-artists",
  tracks: "/library/tracks",
} as const;

export function useLibraryView(presentation: LibraryPresentation) {
  const search = useSearch({ from: "/library" });
  const navigate = useNavigate({ from: "/library" });

  if (presentation === "albums") {
    const request: LibraryCatalogRequest = {
      presentation,
      filter: search.albumsFilter,
      sortKey: search.albumsSort,
      direction: search.albumsDirection,
    };
    return {
      presentation,
      request,
      filter: search.albumsFilter,
      sortKey: search.albumsSort,
      direction: search.albumsDirection,
      setFilter: (filter: string) =>
        navigate({
          to: presentationPath.albums,
          replace: true,
          search: (previous) => ({ ...previous, albumsFilter: filter }),
        }),
      setSort: (sortKey: string) => {
        if (!isAlbumSortKey(sortKey)) return Promise.resolve();
        return navigate({
          to: presentationPath.albums,
          search: (previous) => ({
            ...previous,
            albumsSort: sortKey,
            albumsDirection: "ascending" as const,
          }),
        });
      },
      toggleDirection: () =>
        navigate({
          to: presentationPath.albums,
          search: (previous) => ({
            ...previous,
            albumsDirection: flipDirection(search.albumsDirection),
          }),
        }),
    } as const;
  }

  if (presentation === "albumArtists") {
    const request: LibraryCatalogRequest = {
      presentation,
      filter: search.artistsFilter,
      sortKey: search.artistsSort,
      direction: search.artistsDirection,
    };
    return {
      presentation,
      request,
      filter: search.artistsFilter,
      sortKey: search.artistsSort,
      direction: search.artistsDirection,
      setFilter: (filter: string) =>
        navigate({
          to: presentationPath.albumArtists,
          replace: true,
          search: (previous) => ({ ...previous, artistsFilter: filter }),
        }),
      setSort: (sortKey: string) => {
        if (!isArtistSortKey(sortKey)) return Promise.resolve();
        return navigate({
          to: presentationPath.albumArtists,
          search: (previous) => ({
            ...previous,
            artistsSort: sortKey,
            artistsDirection: "ascending" as const,
          }),
        });
      },
      toggleDirection: () =>
        navigate({
          to: presentationPath.albumArtists,
          search: (previous) => ({
            ...previous,
            artistsDirection: flipDirection(search.artistsDirection),
          }),
        }),
    } as const;
  }

  const request: LibraryCatalogRequest = {
    presentation,
    filter: search.tracksFilter,
    sortKey: search.tracksSort,
    direction: search.tracksDirection,
  };
  return {
    presentation,
    request,
    filter: search.tracksFilter,
    sortKey: search.tracksSort,
    direction: search.tracksDirection,
    setFilter: (filter: string) =>
      navigate({
        to: presentationPath.tracks,
        replace: true,
        search: (previous) => ({ ...previous, tracksFilter: filter }),
      }),
    setTrackSort: (sortKey: LibraryTrackSortKey, direction: LibrarySortDirection) =>
      navigate({
        to: presentationPath.tracks,
        search: (previous) => ({
          ...previous,
          tracksSort: sortKey,
          tracksDirection: direction,
        }),
      }),
  } as const;
}

function flipDirection(direction: LibrarySortDirection): LibrarySortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}

function isAlbumSortKey(value: string): value is LibraryAlbumSortKey {
  return value === "title" || value === "artist" || value === "year";
}

function isArtistSortKey(value: string): value is LibraryAlbumArtistSortKey {
  return value === "artist" || value === "albumCount" || value === "trackCount";
}
