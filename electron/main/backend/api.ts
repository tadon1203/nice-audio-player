import type { BackendTransport } from './transport';
import type {
	AudioOutputDevice,
	PlaybackQueue,
	PlaybackState
} from '../../../src/lib/api/contracts';
import type {
	PlaybackSnapshot,
	PlaybackQueueSnapshot
} from '../../../src/lib/api/generated/protocol';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isNullableNumber = (value: unknown): value is number | null =>
	value === null || typeof value === 'number';

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

const isPlaybackQueue = (value: unknown): value is PlaybackQueueSnapshot =>
	isRecord(value) &&
	isNullableNumber(value.revision) &&
	(value.current === null ||
		(isRecord(value.current) &&
			typeof value.current.id === 'string' &&
			typeof value.current.title === 'string' &&
			(value.current.artist === null || typeof value.current.artist === 'string') &&
			isNullableNumber(value.current.durationMs))) &&
	Array.isArray(value.upcoming) &&
	value.upcoming.every(
		(item) =>
			isRecord(item) &&
			typeof item.id === 'string' &&
			typeof item.title === 'string' &&
			(item.artist === null || typeof item.artist === 'string') &&
			isNullableNumber(item.durationMs)
	) &&
	isStringValue(['off', 'all', 'one'], value.repeatMode) &&
	typeof value.shuffleEnabled === 'boolean';

const isAudioOutputDevices = (value: unknown): value is AudioOutputDevice[] =>
	Array.isArray(value) &&
	value.every(
		(item) =>
			isRecord(item) &&
			typeof item.id === 'string' &&
			typeof item.name === 'string' &&
			typeof item.isDefault === 'boolean'
	);

function decode<T>(value: unknown, guard: (value: unknown) => value is T, name: string): T {
	if (!guard(value)) throw new Error(`Invalid backend response for ${name}`);
	return value;
}

const decodeString = (value: unknown): string =>
	decode(value, (item): item is string => typeof item === 'string', 'ping');
const decodePlaybackState = (value: unknown): PlaybackState =>
	decode(value, isPlaybackSnapshot, 'getPlaybackState');
const decodePlaybackQueue = (value: unknown): PlaybackQueueSnapshot =>
	decode(value, isPlaybackQueue, 'getPlaybackQueue');
const decodeOutputDevices = (value: unknown): AudioOutputDevice[] =>
	decode(value, isAudioOutputDevices, 'listAudioOutputDevices');

export class BackendApi {
	constructor(private readonly transport: BackendTransport) {}

	ping(): Promise<string> {
		return this.transport.send({ method: 'ping' }, decodeString);
	}
	getPlaybackState(): Promise<PlaybackState> {
		return this.transport.send({ method: 'getPlaybackState' }, decodePlaybackState);
	}
	getPlaybackQueue(): Promise<PlaybackQueue> {
		return this.transport.send({ method: 'getPlaybackQueue' }, decodePlaybackQueue);
	}
	listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
		return this.transport.send({ method: 'listAudioOutputDevices' }, decodeOutputDevices);
	}
}
