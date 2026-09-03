import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { secureWindow } from './security';

let mainWindow: BrowserWindow | undefined;

export async function createMainWindow(): Promise<BrowserWindow> {
	const window = new BrowserWindow({
		width: 1280,
		height: 800,
		show: false,
		webPreferences: {
			preload: join(__dirname, 'preload/index.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	});

	secureWindow(window);
	window.once('ready-to-show', () => window.show());

	const devServerUrl = process.env.NICE_AUDIO_PLAYER_DEV_SERVER_URL;
	await window.loadURL(devServerUrl ?? 'nice-player://renderer/');

	mainWindow = window;
	window.on('closed', () => {
		if (mainWindow === window) mainWindow = undefined;
	});

	return window;
}

export function getMainWindow(): BrowserWindow | undefined {
	return mainWindow;
}
