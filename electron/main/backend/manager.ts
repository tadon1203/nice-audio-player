import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { app } from 'electron';
import { BackendApi } from './api';
import { BackendTransport, type BackendWireEvent } from './transport';

export type BackendLaunchConfig = { dataDir: string };
type BackendState = 'created' | 'starting' | 'running' | 'stopped';

export class BackendManager {
	private state: BackendState = 'created';
	private transport: BackendTransport | undefined;
	private backendApi: BackendApi | undefined;

	async start(): Promise<BackendApi> {
		if (this.state !== 'created') throw new Error(`Backend cannot start from ${this.state}`);
		this.state = 'starting';
		const config: BackendLaunchConfig = { dataDir: join(app.getPath('userData'), 'backend') };
		const env = { ...process.env, NICE_AUDIO_PLAYER_DATA_DIR: config.dataDir };
		const projectRoot = app.getAppPath();
		const child = app.isPackaged
			? spawn(join(process.resourcesPath, 'backend', 'nice-audio-player-backend.exe'), [], { env })
			: spawn(
					'cargo',
					[
						'run',
						'--quiet',
						'--manifest-path',
						join(projectRoot, 'backend', 'Cargo.toml'),
						'--bin',
						'nice-audio-player-backend'
					],
					{
						env,
						cwd: projectRoot
					}
				);
		const transport = new BackendTransport(child);
		this.transport = transport;
		transport.onClose(() => {
			this.state = 'stopped';
			this.backendApi = undefined;
		});

		try {
			await this.waitForReady();
			this.backendApi = new BackendApi(transport);
			this.state = 'running';
			return this.backendApi;
		} catch (error) {
			await transport.close();
			this.backendApi = undefined;
			this.transport = undefined;
			this.state = 'stopped';
			throw error;
		}
	}

	onEvent(listener: (event: BackendWireEvent) => void): () => void {
		if (!this.transport) throw new Error('Backend has not started');
		return this.transport.onEvent(listener);
	}

	async shutdown(): Promise<void> {
		if (this.state === 'stopped' || !this.transport) return;
		this.state = 'stopped';
		await this.transport.close();
	}

	get api(): BackendApi {
		if (!this.backendApi) throw new Error('Backend is not running');
		return this.backendApi;
	}

	private waitForReady(): Promise<void> {
		const transport = this.transport;
		if (!transport) return Promise.reject(new Error('Backend transport unavailable'));
		return new Promise((resolve, reject) => {
			let unsubscribeEvent: () => void = () => {};
			let unsubscribeClose: () => void = () => {};
			const cleanup = () => {
				clearTimeout(timeout);
				unsubscribeEvent();
				unsubscribeClose();
			};
			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error('Backend ready timeout'));
			}, 5000);
			unsubscribeEvent = transport.onEvent((event) => {
				if (event.event !== 'ready') return;
				cleanup();
				resolve();
			});
			unsubscribeClose = transport.onClose((error) => {
				cleanup();
				reject(error);
			});
		});
	}
}
