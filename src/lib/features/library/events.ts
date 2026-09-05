import type { LibraryScanSnapshot } from '$lib/api/contracts';

export function isTerminalLibraryScan(snapshot: LibraryScanSnapshot): boolean {
	return ['completed', 'cancelled', 'failed'].includes(snapshot.state);
}
