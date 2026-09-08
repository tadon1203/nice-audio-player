import type { LibraryAlbumKey } from '@shared/native-app-api';

export function requireString(value: unknown, name: string): string {
	if (typeof value !== 'string' || value.length === 0)
		throw new TypeError(`${name} must be a non-empty string`);
	return value;
}

export function requireNullableString(value: unknown, name: string): string | null {
	if (value !== null && typeof value !== 'string')
		throw new TypeError(`${name} must be a string or null`);
	return value;
}

export function requireBoolean(value: unknown, name: string): boolean {
	if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
	return value;
}

export function requireAlbumKey(value: unknown): LibraryAlbumKey {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof (value as { title?: unknown }).title !== 'string' ||
		typeof (value as { albumArtist?: unknown }).albumArtist !== 'string'
	)
		throw new TypeError('albumKey must contain title and albumArtist strings');
	return value as LibraryAlbumKey;
}
