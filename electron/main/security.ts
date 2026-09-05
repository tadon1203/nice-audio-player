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

export function validateSender<TArgs extends unknown[], T>(
	handler: (...args: TArgs) => T | Promise<T>
) {
	return async (event: Electron.IpcMainInvokeEvent, ...args: TArgs): Promise<T> => {
		if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url))
			throw new Error('Untrusted IPC sender');
		try {
			return await handler(...args);
		} catch (error) {
			if (typeof error === 'object' && error !== null && 'code' in error) {
				const code = (error as { code?: unknown }).code;
				if (typeof code === 'string') {
					const message = error instanceof Error ? error.message : 'Backend operation failed';
					throw new Error(`[${code}] ${message}`, { cause: error });
				}
			}
			throw error;
		}
	};
}
