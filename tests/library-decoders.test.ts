import { describe, expect, it } from 'vitest';
import {
	decodeLibraryRoot,
	decodeLibraryStatus,
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
});
