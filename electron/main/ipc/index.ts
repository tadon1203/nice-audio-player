import type { NativeBackend } from '@shared/native-backend';
import { registerLibraryIpc } from './library';
import { registerPlaybackIpc } from './playback';
import { registerPlatformIpc } from './platform';

export function registerIpc(backend: NativeBackend): void {
	registerPlaybackIpc(backend);
	registerPlatformIpc();
	registerLibraryIpc(backend);
}
