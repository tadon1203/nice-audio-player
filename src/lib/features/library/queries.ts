import { createInfiniteQuery, type InfiniteData } from '@tanstack/svelte-query';
import { libraryApi } from '$lib/api/library';
import type {
	LibraryAlbumArtistPage,
	LibraryAlbumPage,
	LibraryTrackPage
} from '$lib/api/contracts';

export const libraryQueryKeys = {
	tracks: (search: string) => ['library', 'tracks', search] as const,
	albums: (search: string) => ['library', 'albums', search] as const,
	albumArtists: (search: string) => ['library', 'albumArtists', search] as const
};

export function createTracksQuery(search: () => string) {
	return createInfiniteQuery<
		LibraryTrackPage,
		Error,
		InfiniteData<LibraryTrackPage>,
		ReturnType<typeof libraryQueryKeys.tracks>,
		string | null
	>(() => ({
		queryKey: libraryQueryKeys.tracks(search()),
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }) => libraryApi.tracks(pageParam, search() || null),
		getNextPageParam: (page) => page.nextAfterId ?? undefined
	}));
}

export function createAlbumsQuery(search: () => string) {
	return createInfiniteQuery<
		LibraryAlbumPage,
		Error,
		InfiniteData<LibraryAlbumPage>,
		ReturnType<typeof libraryQueryKeys.albums>,
		string | null
	>(() => ({
		queryKey: libraryQueryKeys.albums(search()),
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }) => libraryApi.albums(pageParam, search() || null),
		getNextPageParam: (page) => page.nextCursor ?? undefined
	}));
}

export function createAlbumArtistsQuery(search: () => string) {
	return createInfiniteQuery<
		LibraryAlbumArtistPage,
		Error,
		InfiniteData<LibraryAlbumArtistPage>,
		ReturnType<typeof libraryQueryKeys.albumArtists>,
		string | null
	>(() => ({
		queryKey: libraryQueryKeys.albumArtists(search()),
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }) => libraryApi.albumArtists(pageParam, search() || null),
		getNextPageParam: (page) => page.nextCursor ?? undefined
	}));
}
