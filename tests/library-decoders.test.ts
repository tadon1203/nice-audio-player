import { describe, expect, it } from 'vitest';
import { BackendWireMessageSchema } from '../electron/main/backend/schema';

const response = (method: string, result: unknown) =>
	BackendWireMessageSchema.safeParse({
		type: 'response',
		payload: { status: 'ok', id: 1, response: { method, result } }
	});

describe('library backend wire schema', () => {
	it('accepts the documented library root shape', () => {
		expect(
			response('listLibraryRoots', [
				{
					id: 'root-1',
					path: 'C:/Music',
					enabled: true,
					scanGeneration: 0,
					lastSuccessfulScanAtMs: null
				}
			]).success
		).toBe(true);
	});

	it('rejects malformed or incomplete backend data', () => {
		expect(response('listLibraryRoots', [{ id: 'root-1', path: 'C:/Music' }]).success).toBe(false);
		expect(response('listLibraryTracks', { items: [], nextCursor: null }).success).toBe(false);
		expect(
			response('listLibraryTracks', { items: [], totalCount: 184, nextCursor: null }).success
		).toBe(true);
	});

	it('requires album artist aggregate counts', () => {
		const artist = {
			items: [{ key: { name: 'Artist' }, artwork: null, albumCount: 2, trackCount: 12 }],
			totalCount: 1,
			nextCursor: null
		};
		expect(response('listLibraryAlbumArtists', artist).success).toBe(true);
		expect(
			response('listLibraryAlbumArtists', {
				...artist,
				items: [{ ...artist.items[0], trackCount: '12' }]
			}).success
		).toBe(false);
	});

	it('supports nullable track lookup and canonical artwork references', () => {
		const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
		const track = {
			id: 'track-1',
			title: 'Track',
			artist: null,
			album: null,
			albumArtist: null,
			artwork: { contentHash: hash, mimeType: 'jpeg', relativePath: `artwork/ab/${hash}.jpg` },
			durationMs: null,
			availability: 'available',
			playable: true
		};
		expect(response('getLibraryTrackForPath', track).success).toBe(true);
		expect(response('getLibraryTrackForPath', null).success).toBe(true);
	});

	it('validates album details and cursor-paged album tracks', () => {
		const details = {
			summary: { key: { title: 'Album', albumArtist: 'Artist' }, artwork: null, year: 2020 },
			date: '2020',
			trackCount: 2,
			durationMs: 300000,
			firstPlayableTrackId: 'track-1'
		};
		expect(response('getLibraryAlbumDetails', details).success).toBe(true);
		expect(
			response('listLibraryAlbumTracks', { items: [], totalCount: 2, nextCursor: null }).success
		).toBe(true);
		expect(
			response('listLibraryAlbumTracks', { items: [], totalCount: 2, nextCursor: 1 }).success
		).toBe(false);
	});
});
