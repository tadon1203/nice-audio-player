import type {
	AudioOutputDevice as GeneratedAudioOutputDevice,
	BackendEvent,
	PlaybackQueueSnapshot,
	PlaybackSnapshot
} from './generated/protocol';

export type AudioOutputDevice = GeneratedAudioOutputDevice;
export type PlaybackState = PlaybackSnapshot;
export type PlaybackQueue = PlaybackQueueSnapshot;
export type AppEvent = BackendEvent;
export interface NativeAppApi {
	ping(): Promise<string>;
	getPlaybackState(): Promise<PlaybackState>;
	getPlaybackQueue(): Promise<PlaybackQueue>;
	listAudioOutputDevices(): Promise<AudioOutputDevice[]>;
	onEvent(listener: (event: AppEvent) => void): () => void;
}
