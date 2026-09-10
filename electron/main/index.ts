import { app, BrowserWindow, protocol } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { join } from 'node:path';
import { BackendManager } from './backend/manager';
import { registerIpc } from './ipc/index';
import { serveRendererRequest } from './renderer-protocol';
import { createMainWindow, getMainWindow } from './window';

if (squirrelStartup) app.quit();

protocol.registerSchemesAsPrivileged([
	{ scheme: 'nice-player', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
const manager = new BackendManager();
let quitting = false;
app
	.whenReady()
	.then(async () => {
		await manager.start();
		registerIpc(manager);
		if (process.env.NICE_AUDIO_PLAYER_DEV_SERVER_URL === undefined)
			protocol.handle('nice-player', (request) =>
				serveRendererRequest(join(app.getAppPath(), 'renderer', 'browser'), request.url)
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
