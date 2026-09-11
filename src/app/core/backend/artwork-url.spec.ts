import { artworkUrl } from './artwork-url';

describe('artworkUrl', () => {
	it('maps canonical opaque artwork identities to the custom protocol', () => {
		const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
		expect(
			artworkUrl({ contentHash: hash, mimeType: 'jpeg', relativePath: `artwork/ab/${hash}.jpg` })
		).toBe(`nice-artwork://asset/artwork/ab/${hash}.jpg`);
	});

	it('returns null for invalid identities', () => {
		expect(artworkUrl(null)).toBeNull();
		expect(
			artworkUrl({
				contentHash: 'a'.repeat(64),
				mimeType: 'png',
				relativePath: `artwork/aa/${'a'.repeat(64)}.jpg`
			})
		).toBeNull();
	});
});
