import { contextBridge, ipcRenderer } from 'electron';
import type { NativeAppApi } from '../../src/lib/api/contracts';

const api: NativeAppApi = {
	ping: () => ipcRenderer.invoke('app:ping'),
	getPlaybackState: () => ipcRenderer.invoke('playback:get-state'),
	getPlaybackQueue: () => ipcRenderer.invoke('playback:get-queue'),
	listAudioOutputDevices: () => ipcRenderer.invoke('audio:list-output-devices'),
	onEvent: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) =>
			listener(payload);
		ipcRenderer.on('app:event', handler);
		return () => ipcRenderer.removeListener('app:event', handler);
	}
};
contextBridge.exposeInMainWorld('app', api);
