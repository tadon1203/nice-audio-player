import type { BrowserWindow } from 'electron';

export function isTrustedRendererUrl(value: string): boolean {
	try {
		const url = new URL(value);
		if (url.protocol === 'nice-player:' && url.host === 'renderer') return true;
		const devServerUrl = process.env.NICE_AUDIO_PLAYER_DEV_SERVER_URL;
		return devServerUrl !== undefined && url.origin === new URL(devServerUrl).origin;
	} catch {
		return false;
	}
}

export function secureWindow(window: BrowserWindow): void {
	window.webContents.on('will-navigate', (event, url) => {
		if (!isTrustedRendererUrl(url)) event.preventDefault();
	});
	window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

export function validateSender<T>(handler: () => T | Promise<T>) {
	return (event: Electron.IpcMainInvokeEvent): T | Promise<T> => {
		if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url))
			throw new Error('Untrusted IPC sender');
		return handler();
	};
}
