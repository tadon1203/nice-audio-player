import type { BrowserWindow } from 'electron';
import type { IpcError, IpcResult } from '@shared/native-app-api';
import { readNativeErrorCode } from './native-error';

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
	return async (
		event: Electron.IpcMainInvokeEvent,
		...args: TArgs
	): Promise<IpcResult<Awaited<T>>> => {
		if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) {
			return {
				ok: false,
				error: { code: 'untrustedSender', message: 'Untrusted IPC sender' }
			};
		}
		try {
			return { ok: true, value: await handler(...args) };
		} catch (error) {
			return { ok: false, error: normalizeIpcError(error) };
		}
	};
}

function normalizeIpcError(error: unknown): IpcError {
	const code = readNativeErrorCode(error);
	if (code !== undefined) {
		return {
			code,
			message: error instanceof Error ? error.message : 'Backend operation failed'
		};
	}
	if (error instanceof TypeError) return { code: 'invalidArgument', message: error.message };
	return { code: 'internalError', message: 'Internal application error' };
}
