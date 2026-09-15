import { join } from 'node:path';

export function resolveRendererRoot(appPath: string): string {
	return join(appPath, 'renderer', 'browser');
}
