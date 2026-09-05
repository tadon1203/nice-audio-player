import { describe, expect, it } from 'vitest';
import { BackendProtocolError } from '../electron/main/backend/transport';
import { isTrustedRendererUrl, validateSender } from '../electron/main/security';

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
});
