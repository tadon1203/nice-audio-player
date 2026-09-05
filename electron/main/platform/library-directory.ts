import { dialog } from 'electron';
import { getMainWindow } from '../window';

export async function selectLibraryDirectory(): Promise<string | null> {
	const owner = getMainWindow();
	const result = owner
		? await dialog.showOpenDialog(owner, { properties: ['openDirectory'] })
		: await dialog.showOpenDialog({ properties: ['openDirectory'] });
	return result.canceled ? null : (result.filePaths[0] ?? null);
}
