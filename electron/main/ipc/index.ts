import type { BackendManager } from '../backend/manager';
import { registerLibraryIpc } from './library';
import { registerPlaybackIpc } from './playback';
import { registerPlatformIpc } from './platform';

export function registerIpc(manager: BackendManager): void {
	registerPlaybackIpc(manager);
	registerPlatformIpc();
	registerLibraryIpc(manager);
}
