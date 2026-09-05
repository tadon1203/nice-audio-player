import { ipcMain } from 'electron';
import { selectLibraryDirectory } from '../platform/library-directory';
import { validateSender } from '../security';

export function registerPlatformIpc(): void {
	ipcMain.handle(
		'platform:select-library-directory',
		validateSender(() => selectLibraryDirectory())
	);
}
