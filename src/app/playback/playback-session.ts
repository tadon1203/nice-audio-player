import { DestroyRef, Service, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
	AppEvent,
	ArtworkRef,
	LibraryAlbumKey,
	LibraryTrackSummary,
	PlaybackQueue,
	PlaybackState
} from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { readBackendError } from '@app/core/backend/backend-error';
import { playbackCommandErrorMessage } from './playback-errors';

export type PlaybackConnection = 'loading' | 'ready' | 'failed';
export type TransportCommand =
	'startTrack' | 'startAlbum' | 'pause' | 'resume' | 'previous' | 'next';

@Service()
export class PlaybackSession {
	private readonly backend = inject(Backend);
	private readonly destroyRef = inject(DestroyRef);
	private readonly snapshotState = signal<PlaybackState | null>(null);
	private readonly queueState = signal<PlaybackQueue | null>(null);
	private readonly connectionState = signal<PlaybackConnection>('loading');
	private readonly transportPendingState = signal<TransportCommand | null>(null);
	private readonly seekPendingState = signal(false);
	private readonly volumePendingState = signal(false);
	private readonly mutePendingState = signal(false);
	private readonly commandErrorState = signal<string | null>(null);
	private readonly currentTrackState = signal<LibraryTrackSummary | null>(null);
	private readonly requestedVolume = signal<number | null>(null);
	private volumeWriteActive = false;
	private acceptedPlaybackRevision: number | null = null;
	private acceptedQueueRevision: number | null = null;
	private lastLookupPath: string | null = null;
	private lookupSequence = 0;

	readonly snapshot: Signal<PlaybackState | null> = this.snapshotState.asReadonly();
	readonly queue: Signal<PlaybackQueue | null> = this.queueState.asReadonly();
	readonly connection: Signal<PlaybackConnection> = this.connectionState.asReadonly();
	readonly transportPending: Signal<TransportCommand | null> =
		this.transportPendingState.asReadonly();
	readonly seekPending: Signal<boolean> = this.seekPendingState.asReadonly();
	readonly volumePending: Signal<boolean> = this.volumePendingState.asReadonly();
	readonly mutePending: Signal<boolean> = this.mutePendingState.asReadonly();
	readonly commandError: Signal<string | null> = this.commandErrorState.asReadonly();
	readonly currentTrack: Signal<LibraryTrackSummary | null> = this.currentTrackState.asReadonly();
	readonly title = computed(
		() =>
			this.currentTrackState()?.title ??
			this.queueState()?.current?.title ??
			this.snapshotState()?.file?.fileName ??
			'Nothing playing'
	);
	readonly artist = computed(
		() => this.currentTrackState()?.artist ?? this.queueState()?.current?.artist ?? null
	);
	readonly artwork = computed<ArtworkRef | null>(() => this.currentTrackState()?.artwork ?? null);
	readonly positionMs = computed(() => {
		const snapshot = this.snapshotState();
		return snapshot?.status === 'playing' || snapshot?.status === 'paused'
			? (snapshot.positionMs ?? 0)
			: 0;
	});
	readonly durationMs = computed(() => {
		const snapshot = this.snapshotState();
		return snapshot?.status === 'playing' || snapshot?.status === 'paused'
			? snapshot.durationMs
			: null;
	});
	readonly volume = computed(() => this.requestedVolume() ?? this.snapshotState()?.volume ?? 1);
	readonly muted = computed(() => this.snapshotState()?.muted ?? false);

	constructor() {
		this.backend.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
			this.acceptEvent(event);
		});
		void this.initialize();
	}

	startLibraryTrack(trackId: string): Promise<void> {
		return this.runTransport('startTrack', async () => this.backend.startLibraryTrack(trackId));
	}
	startLibraryAlbum(albumKey: LibraryAlbumKey): Promise<void> {
		return this.runTransport('startAlbum', async () => this.backend.startLibraryAlbum(albumKey));
	}
	pause(): Promise<void> {
		return this.runTransport('pause', () => this.backend.pausePlayback());
	}
	resume(): Promise<void> {
		return this.runTransport('resume', () => this.backend.resumePlayback());
	}
	previous(): Promise<void> {
		return this.runTransport('previous', () => this.backend.previousPlayback());
	}
	next(): Promise<void> {
		return this.runTransport('next', () => this.backend.nextPlayback());
	}

	async seek(positionMs: number): Promise<void> {
		if (this.seekPendingState()) return;
		this.seekPendingState.set(true);
		this.commandErrorState.set(null);
		const duration = this.durationMs();
		const requested = Math.max(0, duration === null ? positionMs : Math.min(positionMs, duration));
		try {
			this.acceptPlayback(await this.backend.seekPlayback(requested));
		} catch (error) {
			this.commandErrorState.set(playbackCommandErrorMessage(error));
		} finally {
			this.seekPendingState.set(false);
		}
	}

	setVolume(value: number): void {
		this.requestedVolume.set(Math.max(0, Math.min(1, value)));
		if (!this.volumeWriteActive) void this.flushVolume();
	}

	async toggleMute(): Promise<void> {
		if (this.mutePendingState()) return;
		this.mutePendingState.set(true);
		this.commandErrorState.set(null);
		try {
			this.acceptPlayback(await this.backend.setPlaybackMuted(!this.muted()));
		} catch (error) {
			this.commandErrorState.set(playbackCommandErrorMessage(error));
		} finally {
			this.mutePendingState.set(false);
		}
	}

	private async initialize(): Promise<void> {
		try {
			this.acceptPlayback(await this.backend.getPlaybackState());
			this.acceptQueue(await this.backend.getPlaybackQueue());
			this.connectionState.set('ready');
		} catch (error) {
			this.connectionState.set('failed');
			this.commandErrorState.set(readBackendError(error).message);
		}
	}

	private acceptEvent(event: AppEvent): void {
		switch (event.event) {
			case 'playbackStateChanged':
				this.acceptPlayback(event.payload);
				return;
			case 'playbackQueueStateChanged':
				this.acceptQueue(event.payload);
				return;
			case 'ready':
			case 'applicationActivitiesChanged':
			case 'libraryScanStateChanged':
				return;
			default:
				return;
		}
	}

	private acceptPlayback(snapshot: PlaybackState): void {
		if (!this.acceptRevision(snapshot.revision, this.acceptedPlaybackRevision)) return;
		this.acceptedPlaybackRevision = snapshot.revision;
		this.snapshotState.set(snapshot);
		const path = snapshot.file?.path ?? null;
		if (path === this.lastLookupPath) return;
		this.lastLookupPath = path;
		const sequence = ++this.lookupSequence;
		if (path === null) {
			this.currentTrackState.set(null);
			return;
		}
		void this.lookupTrack(path, sequence);
	}

	private async lookupTrack(path: string, sequence: number): Promise<void> {
		try {
			const track = await this.backend.getLibraryTrackForPath(path);
			if (sequence === this.lookupSequence) this.currentTrackState.set(track);
		} catch {
			if (sequence === this.lookupSequence) this.currentTrackState.set(null);
		}
	}

	private acceptQueue(queue: PlaybackQueue): void {
		if (!this.acceptRevision(queue.revision, this.acceptedQueueRevision)) return;
		this.acceptedQueueRevision = queue.revision;
		this.queueState.set(queue);
	}

	private acceptRevision(incoming: number | null, current: number | null): boolean {
		if (incoming === null) return current === null;
		return current === null || incoming >= current;
	}

	private async runTransport(
		command: TransportCommand,
		operation: () => Promise<PlaybackState>
	): Promise<void> {
		if (this.transportPendingState()) return;
		this.transportPendingState.set(command);
		this.commandErrorState.set(null);
		try {
			this.acceptPlayback(await operation());
		} catch (error) {
			this.commandErrorState.set(playbackCommandErrorMessage(error));
		} finally {
			this.transportPendingState.set(null);
		}
	}

	private async flushVolume(): Promise<void> {
		if (this.volumeWriteActive) return;
		this.volumeWriteActive = true;
		this.volumePendingState.set(true);
		this.commandErrorState.set(null);
		try {
			while (this.requestedVolume() !== null) {
				const requested = this.requestedVolume();
				this.requestedVolume.set(null);
				if (requested === null) continue;
				this.acceptPlayback(await this.backend.setPlaybackVolume(requested));
			}
		} catch (error) {
			this.requestedVolume.set(null);
			this.commandErrorState.set(playbackCommandErrorMessage(error));
		} finally {
			this.volumeWriteActive = false;
			this.volumePendingState.set(false);
		}
	}
}
