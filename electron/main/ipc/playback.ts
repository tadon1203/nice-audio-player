import { ipcMain } from 'electron';
import type { NativeBackend } from '@shared/native-backend';
import { validateSender } from '../security';
import { requireBoolean, requireNonNegativeInteger, requireUnitInterval } from './validation';

export function registerPlaybackIpc(backend: NativeBackend): void {
	ipcMain.handle(
		'playback:get-state',
		validateSender(() => backend.getPlaybackState())
	);
	ipcMain.handle(
		'playback:get-queue',
		validateSender(() => backend.getPlaybackQueue())
	);
	ipcMain.handle(
		'playback:pause',
		validateSender(() => backend.pausePlayback())
	);
	ipcMain.handle(
		'playback:resume',
		validateSender(() => backend.resumePlayback())
	);
	ipcMain.handle(
		'playback:previous',
		validateSender(() => backend.previousPlayback())
	);
	ipcMain.handle(
		'playback:next',
		validateSender(() => backend.nextPlayback())
	);
	ipcMain.handle(
		'playback:seek',
		validateSender((positionMs: unknown) =>
			backend.seekPlayback(requireNonNegativeInteger(positionMs, 'positionMs'))
		)
	);
	ipcMain.handle(
		'playback:set-volume',
		validateSender((volume: unknown) =>
			backend.setPlaybackVolume(requireUnitInterval(volume, 'volume'))
		)
	);
	ipcMain.handle(
		'playback:set-muted',
		validateSender((muted: unknown) => backend.setPlaybackMuted(requireBoolean(muted, 'muted')))
	);
	ipcMain.handle(
		'audio:list-output-devices',
		validateSender(() => backend.listAudioOutputDevices())
	);
}
