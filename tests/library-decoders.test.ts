import { describe, expect, it } from 'vitest';
import {
	decodeLibraryRoot,
	decodeLibraryStatus,
	decodeLibraryAlbumDetails,
	decodeLibraryAlbumTracks,
	decodeLibraryTrack,
	decodeLibraryTracks
} from '../electron/main/backend/decoders/library';

describe('library backend decoders', () => {
	it('accepts the documented library root shape', () => {
		expect(
			decodeLibraryRoot({
				id: 'root-1',
				path: 'C:/Music',
				enabled: true,
				scanGeneration: null,
				lastSuccessfulScanAtMs: null
			})
		).toMatchObject({ id: 'root-1', enabled: true });
	});

	it('rejects malformed or incomplete backend data', () => {
		expect(() => decodeLibraryRoot({ id: 'root-1', path: 'C:/Music' })).toThrow(
			/Invalid backend response/
		);
		expect(() => decodeLibraryTracks({ items: [{ id: 'track-1' }], nextAfterId: null })).toThrow(
			/Invalid backend response/
		);
		expect(() => decodeLibraryTracks({ items: [], nextAfterId: null })).toThrow(
			/Invalid backend response/
		);
	});

	it('accepts a catalog page with an explicit total count', () => {
		expect(decodeLibraryTracks({ items: [], totalCount: 184, nextAfterId: null })).toEqual({
			items: [],
			totalCount: 184,
			nextAfterId: null
		});
	});

	it('requires canonical artwork references and supports nullable track lookup', () => {
		const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
		const track = {
			id: 'track-1',
			title: 'Track',
			artist: null,
			album: null,
			albumArtist: null,
			artwork: {
				contentHash: hash,
				mimeType: 'jpeg',
				relativePath: `artwork/ab/${hash}.jpg`
			},
			durationMs: null,
			availability: 'available',
			playable: true
		};
		expect(decodeLibraryTrack(track)).toEqual(track);
		expect(decodeLibraryTrack(null)).toBeNull();
		expect(() =>
			decodeLibraryTrack({
				...track,
				artwork: { ...track.artwork, relativePath: `artwork/ac/${hash}.jpg` }
			})
		).toThrow();
		expect(decodeLibraryStatus({ status: 'ready' })).toEqual({ status: 'ready' });
	});

	it('accepts album details and album track technical metadata', () => {
		const details = {
			summary: { key: { title: 'Album', albumArtist: 'Artist' }, artwork: null },
			date: '2020',
			trackCount: 2,
			durationMs: 300000,
			firstPlayableTrackId: 'track-1'
		};
		const tracks = {
			items: [
				{
					id: 'track-1',
					title: 'Track',
					artist: 'Artist',
					trackNumber: 1,
					discNumber: null,
					fileFormat: 'FLAC',
					bitDepth: 24,
					sampleRate: 96000,
					durationMs: 120000,
					availability: 'available',
					playable: true
				}
			],
			nextOffset: null
		};
		expect(decodeLibraryAlbumDetails(details)).toEqual(details);
		expect(decodeLibraryAlbumTracks(tracks)).toEqual(tracks);
		expect(() =>
			decodeLibraryAlbumTracks({ items: [{ ...tracks.items[0], sampleRate: '96000' }] })
		).toThrow();
	});
});
