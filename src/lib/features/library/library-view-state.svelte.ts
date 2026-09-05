export type LibraryPresentation = 'albums' | 'albumArtists' | 'tracks';

export const libraryViewState = $state<{
	presentation: LibraryPresentation;
	searches: Record<LibraryPresentation, string>;
	scrollTop: Record<LibraryPresentation, number>;
}>({
	presentation: 'tracks',
	searches: { albums: '', albumArtists: '', tracks: '' },
	scrollTop: { albums: 0, albumArtists: 0, tracks: 0 }
});
