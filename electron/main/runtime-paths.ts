import { join } from 'node:path';

const BACKEND_BINARY = 'nice-audio-player-backend';

export function resolveRendererRoot(appPath: string): string {
	return join(appPath, 'renderer', 'browser');
}

export function resolvePackagedBackendExecutable(
	resourcesPath: string,
	platform: NodeJS.Platform
): string {
	const binaryName = platform === 'win32' ? `${BACKEND_BINARY}.exe` : BACKEND_BINARY;
	return join(resourcesPath, 'backend', binaryName);
}

export function resolveDevelopmentBackend(repositoryRoot: string): {
	cwd: string;
	manifestPath: string;
} {
	return {
		cwd: repositoryRoot,
		manifestPath: join(repositoryRoot, 'backend', 'Cargo.toml')
	};
}
