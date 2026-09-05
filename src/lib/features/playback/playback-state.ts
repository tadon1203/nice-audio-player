import type { PlaybackState } from '$lib/api/contracts';

export function shouldApplyPlaybackSnapshot(
	current: PlaybackState | null,
	next: PlaybackState
): boolean {
	return current === null || (next.revision ?? -1) >= (current.revision ?? -1);
}
