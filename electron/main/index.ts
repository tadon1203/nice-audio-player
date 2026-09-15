import { app, BrowserWindow, protocol } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import type { BackendEvent, NativeBackend } from '@shared/native-backend';
import { loadNativeBinding } from './native-backend';
import { readNativeErrorCode } from './native-error';
import { registerIpc } from './ipc/index';
import { serveArtworkRequest } from './artwork-protocol';
import { serveRendererRequest } from './renderer-protocol';
import { resolveRendererRoot } from './runtime-paths';
import { createMainWindow, getMainWindow } from './window';

if (squirrelStartup) app.quit();

if (process.env.NICE_AUDIO_PLAYER_E2E === '1') {
	const testDataDirectory = process.env.NICE_AUDIO_PLAYER_TEST_DATA_DIR;
	if (testDataDirectory) app.setPath('userData', testDataDirectory);
}

protocol.registerSchemesAsPrivileged([
	{ scheme: 'nice-player', privileges: { standard: true, secure: true, supportFetchAPI: true } },
	{ scheme: 'nice-artwork', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

let backend: NativeBackend | undefined;
let eventForwarder: Promise<void> | undefined;
let quitting = false;

async function forwardBackendEvents(nativeBackend: NativeBackend): Promise<void> {
	for (;;) {
		try {
			const event: BackendEvent = await nativeBackend.nextEvent();
			getMainWindow()?.webContents.send('app:event', event);
		} catch (error) {
			if (quitting && isBackendClosed(error)) return;
			throw error;
		}
	}
}

function isBackendClosed(error: unknown): boolean {
	return readNativeErrorCode(error) === 'backendClosed';
}

app
	.whenReady()
	.then(async () => {
		protocol.handle('nice-artwork', (request) =>
			serveArtworkRequest(app.getPath('userData'), request.url)
		);
		const { NativeBackend } = loadNativeBinding();
		backend = await NativeBackend.open(app.getPath('userData'));
		registerIpc(backend);
		eventForwarder = forwardBackendEvents(backend);
		void eventForwarder.catch((error: unknown) => {
			console.error('[main] backend event forwarding failed', error);
			if (!quitting) app.exit(1);
		});
		if (process.env.NICE_AUDIO_PLAYER_DEV_SERVER_URL === undefined)
			protocol.handle('nice-player', (request) =>
				serveRendererRequest(resolveRendererRoot(app.getAppPath()), request.url)
			);
		await createMainWindow();
		app.on('activate', () => {
			void (async () => {
				if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
			})();
		});
	})
	.catch((error: unknown) => {
		console.error('[main] startup failed', error);
		app.exit(1);
	});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') void app.quit();
});

app.on('before-quit', (event) => {
	if (quitting) return;
	event.preventDefault();
	quitting = true;
	void (async () => {
		if (backend) await backend.shutdown();
		if (eventForwarder) await eventForwarder;
		app.exit(0);
	})().catch((error: unknown) => {
		console.error('[main] shutdown failed', error);
		app.exit(1);
	});
});
