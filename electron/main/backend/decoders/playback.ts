import type {
	PlaybackQueueSnapshot,
	PlaybackSnapshot
} from '../../../../src/lib/api/generated/protocol';
import { decode, isNullableNumber, isRecord } from './shared';

const isStringValue = (values: readonly string[], value: unknown): value is string =>
	typeof value === 'string' && values.includes(value);

const isValidatedAudioFile = (value: unknown): boolean =>
	isRecord(value) &&
	typeof value.path === 'string' &&
	typeof value.fileName === 'string' &&
	typeof value.extension === 'string';

const isOutputSelection = (value: unknown): boolean =>
	isRecord(value) &&
	(value.kind === 'systemDefault' ||
		(value.kind === 'device' && typeof value.deviceId === 'string'));

const isDeviceIdentity = (value: unknown): boolean =>
	isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';

const isPlaybackSnapshot = (value: unknown): value is PlaybackSnapshot => {
	if (
		!isRecord(value) ||
		!isStringValue(['stopped', 'playing', 'paused', 'failed'], value.status) ||
		!isNullableNumber(value.revision) ||
		!isNullableNumber(value.volume) ||
		typeof value.muted !== 'boolean' ||
		!isOutputSelection(value.outputSelection) ||
		typeof value.canGoPrevious !== 'boolean' ||
		typeof value.canGoNext !== 'boolean'
	)
		return false;
	if (value.status === 'stopped') return value.file === null || isValidatedAudioFile(value.file);
	if (value.status === 'failed')
		return (
			(value.file === null || isValidatedAudioFile(value.file)) &&
			(value.playbackId === null || typeof value.playbackId === 'string') &&
			typeof value.error === 'string'
		);
	return (
		isValidatedAudioFile(value.file) &&
		typeof value.playbackId === 'string' &&
		isNullableNumber(value.positionMs) &&
		isNullableNumber(value.durationMs) &&
		isDeviceIdentity(value.outputDevice) &&
		typeof value.channelConversion === 'string' &&
		typeof value.sourceSampleRate === 'number' &&
		typeof value.outputSampleRate === 'number' &&
		typeof value.resamplingActive === 'boolean'
	);
};

export const decodePlaybackState = (value: unknown): PlaybackSnapshot =>
	decode(value, isPlaybackSnapshot, 'getPlaybackState');

export const decodeLibraryPlaybackState = (value: unknown): PlaybackSnapshot =>
	decode(value, isPlaybackSnapshot, 'libraryPlayback');

export const decodePlaybackQueue = (value: unknown): PlaybackQueueSnapshot =>
	decode(
		value,
		(item): item is PlaybackQueueSnapshot =>
			isRecord(item) &&
			isNullableNumber(item.revision) &&
			(item.current === null || isQueueItem(item.current)) &&
			Array.isArray(item.upcoming) &&
			item.upcoming.every(isQueueItem) &&
			isStringValue(['off', 'all', 'one'], item.repeatMode) &&
			typeof item.shuffleEnabled === 'boolean',
		'getPlaybackQueue'
	);

const isQueueItem = (value: unknown): boolean =>
	isRecord(value) &&
	typeof value.id === 'string' &&
	typeof value.title === 'string' &&
	(value.artist === null || typeof value.artist === 'string') &&
	isNullableNumber(value.durationMs);
