import { describe, expect, it } from 'vitest';
import { BackendProtocolError } from '../electron/main/backend/transport';
import { isTrustedRendererUrl, validateSender } from '../electron/main/security';
import {
	resolveDevelopmentBackend,
	resolvePackagedBackendExecutable,
	resolveRendererRoot
} from '../electron/main/runtime-paths';

describe('Electron boundaries', () => {
	it('accepts only trusted renderer URLs', () => {
		expect(isTrustedRendererUrl('nice-player://renderer/library')).toBe(true);
		expect(isTrustedRendererUrl('https://evil.example/library')).toBe(false);
	});

	it('rejects untrusted IPC senders before invoking the handler', async () => {
		let invoked = false;
		const handler = validateSender(() => {
			invoked = true;
			return 'ok';
		});
		await expect(
			handler({ senderFrame: { url: 'https://evil.example' } } as never)
		).rejects.toThrow('Untrusted IPC sender');
		expect(invoked).toBe(false);
	});

	it('keeps backend error codes available at the main-process boundary', () => {
		const error = new BackendProtocolError('trackNotFound', 'Backend operation failed');
		expect(error.code).toBe('trackNotFound');
		expect(error.message).toBe('Backend operation failed');
	});

	it('resolves packaged renderer and backend paths from their Electron roots', () => {
		expect(resolveRendererRoot('C:/app')).toBe('C:\\app\\renderer\\browser');
		expect(resolvePackagedBackendExecutable('C:/resources', 'win32')).toBe(
			'C:\\resources\\backend\\nice-audio-player-backend.exe'
		);
	});

	it('resolves the development backend from the repository root', () => {
		const paths = resolveDevelopmentBackend('C:/repository');

		expect(paths).toEqual({
			cwd: 'C:/repository',
			manifestPath: 'C:\\repository\\backend\\Cargo.toml'
		});
	});
});
