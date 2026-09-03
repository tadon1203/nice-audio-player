import { createInterface } from 'node:readline';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BackendRequest, BackendResponse } from '../../../src/lib/api/generated/protocol';

export type Method = BackendRequest['method'];
export type RequestFor<M extends Method> = Extract<BackendRequest, { method: M }>;
export type ResponseFor<M extends Method> = Extract<BackendResponse, { method: M }>['result'];

export type BackendWireEvent = { event: string; payload?: unknown };
export type BackendWireResponse = {
	id: number;
	result?: unknown;
	error?: { code: string; message: string };
};

export class BackendTransport {
	private nextId = 0;
	private closed = false;
	private closeError: Error | undefined;
	private closeNotified = false;
	private readonly pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
		}
	>();
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
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.child.stdin.write(`${JSON.stringify({ ...request, id })}\n`);
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
		try {
			const message = JSON.parse(line) as BackendWireResponse & BackendWireEvent;
			if (typeof message.id === 'number') {
				const request = this.pending.get(message.id);
				if (!request) return;
				this.pending.delete(message.id);
				if (message.error) request.reject(new Error(message.error.message));
				else request.resolve(message.result);
				return;
			}
			if (typeof message.event === 'string')
				this.eventListeners.forEach((listener) => listener(message));
		} catch (error) {
			console.error('Invalid backend message', error);
		}
	}

	private rejectPending(error: Error): void {
		this.pending.forEach(({ reject }) => reject(error));
		this.pending.clear();
	}
}
