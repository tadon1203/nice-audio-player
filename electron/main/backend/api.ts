import type { BackendTransport } from './transport';
import type {
	AudioOutputDevice,
	PlaybackQueue,
	PlaybackState
} from '../../../src/lib/api/contracts';

export class BackendApi {
	constructor(private readonly transport: BackendTransport) {}

	ping(): Promise<string> {
		return this.transport.send({ method: 'ping' });
	}
	getPlaybackState(): Promise<PlaybackState> {
		return this.transport.send({ method: 'getPlaybackState' });
	}
	getPlaybackQueue(): Promise<PlaybackQueue> {
		return this.transport.send({ method: 'getPlaybackQueue' });
	}
	listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
		return this.transport.send({ method: 'listAudioOutputDevices' });
	}
}
