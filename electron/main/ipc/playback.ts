import { ipcMain } from 'electron';
import type { BackendManager } from '../backend/manager';
import { validateSender } from '../security';
import { requireBoolean, requireNonNegativeInteger, requireUnitInterval } from './validation';

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
		'playback:pause',
		validateSender(() => api.pausePlayback())
	);
	ipcMain.handle(
		'playback:resume',
		validateSender(() => api.resumePlayback())
	);
	ipcMain.handle(
		'playback:previous',
		validateSender(() => api.previousPlayback())
	);
	ipcMain.handle(
		'playback:next',
		validateSender(() => api.nextPlayback())
	);
	ipcMain.handle(
		'playback:seek',
		validateSender((positionMs: unknown) =>
			api.seekPlayback(requireNonNegativeInteger(positionMs, 'positionMs'))
		)
	);
	ipcMain.handle(
		'playback:set-volume',
		validateSender((volume: unknown) =>
			api.setPlaybackVolume(requireUnitInterval(volume, 'volume'))
		)
	);
	ipcMain.handle(
		'playback:set-muted',
		validateSender((muted: unknown) => api.setPlaybackMuted(requireBoolean(muted, 'muted')))
	);
	ipcMain.handle(
		'audio:list-output-devices',
		validateSender(() => api.listAudioOutputDevices())
	);
}
