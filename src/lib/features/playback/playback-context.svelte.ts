import { createContext } from 'svelte';
import type { PlaybackState } from '$lib/api/contracts';

export type PlaybackMirror = {
	snapshot: PlaybackState | null;
	status: 'loading' | 'ready' | 'unavailable' | 'failed';
	error: string | null;
};

export type PlaybackController = {
	update: (next: PlaybackState) => void;
};

export const [getPlaybackController, setPlaybackController] = createContext<PlaybackController>();
