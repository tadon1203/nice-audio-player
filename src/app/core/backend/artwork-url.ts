import type { ArtworkRef } from '@shared/native-app-api';

const ARTWORK_PATH = /^artwork\/([0-9a-f]{2})\/([0-9a-f]{64})\.(jpg|png)$/;

export function artworkUrl(artwork: ArtworkRef | null): string | null {
	if (artwork === null || typeof artwork !== 'object') return null;
	if (!/^[0-9a-f]{64}$/.test(artwork.contentHash)) return null;
	const match = ARTWORK_PATH.exec(artwork.relativePath);
	if (!match || match[1] !== artwork.contentHash.slice(0, 2)) return null;
	if (match[2] !== artwork.contentHash) return null;
	if (artwork.mimeType === 'jpeg' && match[3] !== 'jpg') return null;
	if (artwork.mimeType === 'png' && match[3] !== 'png') return null;
	return `nice-artwork://asset/${artwork.relativePath}`;
}
