import { app, BrowserWindow, protocol } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { BackendManager } from './backend/manager';
import { registerIpc } from './ipc/index';
import { serveArtworkRequest } from './artwork-protocol';
import { serveRendererRequest } from './renderer-protocol';
import { resolveBackendDataDirectory, resolveRendererRoot } from './runtime-paths';
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
const manager = new BackendManager();
let quitting = false;
app
	.whenReady()
	.then(async () => {
		protocol.handle('nice-artwork', (request) =>
			serveArtworkRequest(resolveBackendDataDirectory(app.getPath('userData')), request.url)
		);
		await manager.start();
		registerIpc(manager);
		if (process.env.NICE_AUDIO_PLAYER_DEV_SERVER_URL === undefined)
			protocol.handle('nice-player', (request) =>
				serveRendererRequest(resolveRendererRoot(app.getAppPath()), request.url)
			);
		manager.onEvent((event) => getMainWindow()?.webContents.send('app:event', event));
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
	void manager.shutdown().finally(() => app.exit(0));
});
