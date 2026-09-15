import { describe, expect, it } from 'vitest';
import { resolveArtworkRequest } from '../electron/main/artwork-protocol';
import { isTrustedRendererUrl, validateSender } from '../electron/main/security';
import { resolveRendererRoot } from '../electron/main/runtime-paths';

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
		expect(await handler({ senderFrame: { url: 'https://evil.example' } } as never)).toEqual({
			ok: false,
			error: { code: 'untrustedSender', message: 'Untrusted IPC sender' }
		});
		expect(invoked).toBe(false);
	});

	it('returns typed IPC success and native error envelopes', async () => {
		const success = validateSender(() => 'ok');
		const failure = validateSender(() => {
			throw new Error('nativeError:trackNotFound');
		});

		expect(
			await success({ senderFrame: { url: 'nice-player://renderer/library' } } as never)
		).toEqual({ ok: true, value: 'ok' });
		expect(
			await failure({ senderFrame: { url: 'nice-player://renderer/library' } } as never)
		).toEqual({
			ok: false,
			error: { code: 'trackNotFound', message: 'nativeError:trackNotFound' }
		});
	});

	it('preserves an ordinary application error code without native prefix parsing here', async () => {
		const failure = validateSender(() => {
			throw Object.assign(new Error('Track was not found'), { code: 'trackNotFound' });
		});

		expect(
			await failure({ senderFrame: { url: 'nice-player://renderer/library' } } as never)
		).toEqual({
			ok: false,
			error: { code: 'trackNotFound', message: 'Track was not found' }
		});
	});

	it('resolves the packaged renderer path from the Electron root', () => {
		expect(resolveRendererRoot('C:/app')).toBe('C:\\app\\renderer\\browser');
	});

	it('accepts only canonical artwork URLs under the user data root', () => {
		const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
		const valid = `nice-artwork://asset/artwork/ab/${hash}.jpg`;
		expect(resolveArtworkRequest('C:/user-data', valid)).toEqual({
			path: 'C:\\user-data\\artwork\\ab\\' + hash + '.jpg',
			mimeType: 'image/jpeg'
		});
		expect(
			resolveArtworkRequest('C:/user-data', `nice-artwork://asset/artwork/../${hash}.jpg`)
		).toBeNull();
		expect(
			resolveArtworkRequest('C:/user-data', `nice-artwork://asset/artwork/%2e%2e/${hash}.jpg`)
		).toBeNull();
		expect(
			resolveArtworkRequest('C:/user-data', `nice-artwork://other/artwork/ab/${hash}.jpg`)
		).toBeNull();
		expect(
			resolveArtworkRequest('C:/user-data', `nice-artwork://asset/artwork/ac/${hash}.jpg`)
		).toBeNull();
		expect(
			resolveArtworkRequest('C:/user-data', `nice-artwork://asset/artwork/ab/${hash}.gif`)
		).toBeNull();
	});
});
