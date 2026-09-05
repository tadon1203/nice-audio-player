import { ipcMain } from 'electron';
import type { BackendManager } from '../backend/manager';
import { validateSender } from '../security';

export function registerPlaybackIpc(manager: BackendManager): void {
	const api = manager.api;
	ipcMain.handle(
		'app:ping',
		validateSender(() => api.ping())
	);
	ipcMain.handle(
		'playback:get-state',
		validateSender(() => api.getPlaybackState())
	);
	ipcMain.handle(
		'playback:get-queue',
		validateSender(() => api.getPlaybackQueue())
	);
	ipcMain.handle(
		'audio:list-output-devices',
		validateSender(() => api.listAudioOutputDevices())
	);
}
