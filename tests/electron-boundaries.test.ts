import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { BackendProtocolError, BackendTransport } from '../electron/main/backend/transport';
import { BackendWireMessageSchema } from '../electron/main/backend/schema';
import { resolveArtworkRequest } from '../electron/main/artwork-protocol';
import { isTrustedRendererUrl, validateSender } from '../electron/main/security';
import {
	resolveDevelopmentBackend,
	resolvePackagedBackendExecutable,
	resolveRendererRoot
} from '../electron/main/runtime-paths';

class FakeBackendProcess extends EventEmitter {
	readonly stdin = new PassThrough();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	killed = false;

	kill(): boolean {
		this.killed = true;
		return true;
	}
}

function requestId(line: string): number {
	const value: unknown = JSON.parse(line);
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof (value as { id?: unknown }).id !== 'number'
	)
		throw new Error('Invalid request fixture');
	return (value as { id: number }).id;
}

const closeTransport = async (transport: BackendTransport, child: FakeBackendProcess) => {
	const closing = transport.close();
	child.emit('close', 0);
	await closing;
};

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

	it('returns typed IPC success and error envelopes without string encoding', async () => {
		const success = validateSender(() => 'ok');
		const failure = validateSender(() => {
			throw Object.assign(new Error('Track was not found'), { code: 'trackNotFound' });
		});

		expect(
			await success({ senderFrame: { url: 'nice-player://renderer/library' } } as never)
		).toEqual({
			ok: true,
			value: 'ok'
		});
		expect(
			await failure({ senderFrame: { url: 'nice-player://renderer/library' } } as never)
		).toEqual({
			ok: false,
			error: { code: 'trackNotFound', message: 'Track was not found' }
		});
	});

	it('keeps backend error codes available at the main-process boundary', () => {
		const error = new BackendProtocolError('trackNotFound', 'Backend operation failed');
		expect(error.code).toBe('trackNotFound');
		expect(error.message).toBe('Backend operation failed');
	});

	it('validates backend frames at the transport boundary', () => {
		expect(
			BackendWireMessageSchema.safeParse({
				type: 'response',
				payload: {
					status: 'ok',
					id: 3,
					response: { method: 'ping', result: 'pong' }
				}
			}).success
		).toBe(true);
		expect(
			BackendWireMessageSchema.safeParse({
				type: 'response',
				payload: {
					status: 'ok',
					id: 3,
					response: { method: 'ping', result: null }
				}
			}).success
		).toBe(false);
		expect(
			BackendWireMessageSchema.safeParse({
				type: 'response',
				payload: {
					status: 'ok',
					id: 3,
					response: { method: 'getLibraryTrackForPath', result: null }
				}
			}).success
		).toBe(true);
	});

	it('rejects unknown methods and malformed events', () => {
		expect(
			BackendWireMessageSchema.safeParse({
				type: 'response',
				payload: {
					status: 'ok',
					id: 1,
					response: { method: 'futureMethod', result: null }
				}
			}).success
		).toBe(false);
		expect(
			BackendWireMessageSchema.safeParse({
				type: 'event',
				payload: { event: 'playbackStateChanged', payload: { status: 'stopped' } }
			}).success
		).toBe(false);
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

	it('accepts only canonical artwork URLs under the backend data root', () => {
		const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
		const valid = `nice-artwork://asset/artwork/ab/${hash}.jpg`;
		expect(resolveArtworkRequest('C:/user-data/backend', valid)).toEqual({
			path: 'C:\\user-data\\backend\\artwork\\ab\\' + hash + '.jpg',
			mimeType: 'image/jpeg'
		});
		expect(
			resolveArtworkRequest('C:/user-data/backend', `nice-artwork://asset/artwork/../${hash}.jpg`)
		).toBeNull();
		expect(
			resolveArtworkRequest(
				'C:/user-data/backend',
				`nice-artwork://asset/artwork/%2e%2e/${hash}.jpg`
			)
		).toBeNull();
		expect(
			resolveArtworkRequest('C:/user-data/backend', `nice-artwork://other/artwork/ab/${hash}.jpg`)
		).toBeNull();
		expect(
			resolveArtworkRequest('C:/user-data/backend', `nice-artwork://asset/artwork/ac/${hash}.jpg`)
		).toBeNull();
		expect(
			resolveArtworkRequest('C:/user-data/backend', `nice-artwork://asset/artwork/ab/${hash}.gif`)
		).toBeNull();
	});

	it('matches concurrent responses by request id, including out of order responses', async () => {
		const child = new FakeBackendProcess();
		const frames: string[] = [];
		child.stdin.on('data', (chunk: Buffer) => frames.push(chunk.toString()));
		const transport = new BackendTransport(child as never);
		const first = transport.send({ method: 'ping' });
		const second = transport.send({ method: 'ping' });
		await new Promise<void>((resolve) => setImmediate(resolve));
		const requests = frames
			.join('')
			.trim()
			.split('\n')
			.map((line) => ({ id: requestId(line) }));
		child.stdout.write(
			JSON.stringify({
				type: 'response',
				payload: {
					status: 'ok',
					id: requests[1].id,
					response: { method: 'ping', result: 'second' }
				}
			}) + '\n'
		);
		child.stdout.write(
			JSON.stringify({
				type: 'response',
				payload: { status: 'ok', id: requests[0].id, response: { method: 'ping', result: 'first' } }
			}) + '\n'
		);
		expect(await first).toBe('first');
		expect(await second).toBe('second');
		await closeTransport(transport, child);
	});

	it('fails all pending requests when the backend frame is malformed', async () => {
		const child = new FakeBackendProcess();
		const transport = new BackendTransport(child as never);
		const pending = transport.send({ method: 'ping' });
		child.stdout.write('{not-json}\n');
		await expect(pending).rejects.toMatchObject({ code: 'protocolError' });
		expect(child.killed).toBe(true);
	});
});
