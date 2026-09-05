import { getAppApi } from '$lib/api/client';
import type { AppEvent, PlaybackState } from '$lib/api/contracts';

let unsubscribe: (() => void) | undefined;

export type PlaybackSnapshotListener = (next: PlaybackState) => void;

export async function initializePlaybackSession(
	listener: PlaybackSnapshotListener,
	setStatus: (status: 'loading' | 'ready' | 'unavailable' | 'failed') => void,
	setError: (error: string | null) => void
): Promise<void> {
	if (unsubscribe) return;
	try {
		const api = getAppApi();
		const initial = await api.getPlaybackState();
		listener(initial);
		setStatus(initial.status === 'failed' ? 'failed' : 'ready');
		unsubscribe = api.onEvent((event: AppEvent) => {
			if (event.event === 'playbackStateChanged') {
				listener(event.payload);
				setStatus(event.payload.status === 'failed' ? 'failed' : 'ready');
				setError(null);
			}
		});
	} catch (cause) {
		setStatus('unavailable');
		setError(cause instanceof Error ? cause.message : 'Playback is unavailable');
	}
}
