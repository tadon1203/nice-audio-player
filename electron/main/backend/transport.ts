import { createInterface } from 'node:readline';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BackendRequest, BackendResponse } from '@shared/protocol/types';
import {
	BackendWireMessageSchema,
	type BackendWireEvent,
	type BackendWireMessage,
	type BackendWireResponse
} from './schema';

export type Method = BackendRequest['method'];
export type RequestFor<M extends Method> = Extract<BackendRequest, { method: M }>;
type ResponseByMethod = {
	[M in BackendResponse['method']]: Extract<BackendResponse, { method: M }>['result'];
};
export type ResponseFor<M extends Method> = ResponseByMethod[M];

export class BackendProtocolError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'BackendProtocolError';
	}
}

type PendingRequest = {
	method: Method;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

export class BackendTransport {
	private nextId = 0;
	private closed = false;
	private closeError: Error | undefined;
	private closeNotified = false;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly eventListeners = new Set<(event: BackendWireEvent) => void>();
	private readonly closeListeners = new Set<(error: Error) => void>();

	constructor(private readonly child: ChildProcessWithoutNullStreams) {
		createInterface({ input: child.stdout }).on('line', (line) => this.receive(line));
		child.on('close', (code) =>
			this.handleClose(new Error(`Backend exited with code ${code ?? 'unknown'}`))
		);
		child.stderr.on('data', (chunk: Buffer) =>
			console.error(`[backend] ${chunk.toString().trimEnd()}`)
		);
	}

	send<M extends Method>(request: RequestFor<M>): Promise<ResponseFor<M>> {
		if (this.closed) return Promise.reject(this.closeError ?? new Error('Backend is not running'));
		const id = ++this.nextId;
		return new Promise<ResponseFor<M>>((resolve, reject) => {
			this.pending.set(id, {
				method: request.method,
				resolve: (value) => resolve(value as ResponseFor<M>),
				reject
			});
			this.child.stdin.write(`${JSON.stringify({ id, request })}\n`);
		});
	}

	onEvent(listener: (event: BackendWireEvent) => void): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	onClose(listener: (error: Error) => void): () => void {
		this.closeListeners.add(listener);
		return () => this.closeListeners.delete(listener);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.closeError = new Error('Backend is shutting down');
		this.rejectPending(this.closeError);
		this.child.stdin.end();
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				this.child.kill();
				resolve();
			}, 1500);
			this.child.once('close', () => {
				clearTimeout(timer);
				resolve();
			});
		});
	}

	private handleClose(error: Error): void {
		if (!this.closed) {
			this.closed = true;
			this.closeError = error;
			this.rejectPending(error);
		}
		if (this.closeNotified) return;
		this.closeNotified = true;
		this.closeListeners.forEach((listener) => listener(this.closeError ?? error));
	}

	private receive(line: string): void {
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			this.failProtocol('Malformed backend JSON');
			return;
		}
		const parsed = BackendWireMessageSchema.safeParse(value);
		if (!parsed.success) {
			this.failProtocol('Invalid backend message');
			return;
		}
		const message: BackendWireMessage = parsed.data;
		if (message.type === 'event') {
			this.eventListeners.forEach((listener) => listener(message.payload));
			return;
		}
		const response: BackendWireResponse = message;
		const pending = this.pending.get(response.payload.id);
		if (!pending) return;
		this.pending.delete(response.payload.id);
		if (response.payload.status === 'error') {
			pending.reject(
				new BackendProtocolError(response.payload.error.code, response.payload.error.message)
			);
			return;
		}
		if (response.payload.response.method !== pending.method) {
			pending.reject(new Error('Backend response method mismatch'));
			return;
		}
		pending.resolve(response.payload.response.result);
	}

	private failProtocol(message: string): void {
		const error = new BackendProtocolError('protocolError', message);
		this.handleClose(error);
		this.child.kill();
	}

	private rejectPending(error: Error): void {
		this.pending.forEach(({ reject }) => reject(error));
		this.pending.clear();
	}
}
