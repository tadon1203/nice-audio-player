import { Component, computed, inject, signal } from '@angular/core';
import {
	LucidePause,
	LucidePlay,
	LucideSkipBack,
	LucideSkipForward,
	LucideVolume2,
	LucideVolumeX
} from '@lucide/angular';
import { Button } from '@app/ui/button';
import { Artwork } from '@app/ui/artwork';
import { FormatDurationPipe } from '@app/ui/format-duration';
import { PlaybackSession } from './playback-session';

@Component({
	imports: [
		Artwork,
		Button,
		FormatDurationPipe,
		LucidePause,
		LucidePlay,
		LucideSkipBack,
		LucideSkipForward,
		LucideVolume2,
		LucideVolumeX
	],
	selector: 'app-playback-dock',
	templateUrl: './playback-dock.html'
})
export class PlaybackDock {
	protected readonly session = inject(PlaybackSession);
	protected readonly seekPreviewMs = signal<number | null>(null);
	protected readonly seekValue = computed(() => this.seekPreviewMs() ?? this.session.positionMs());

	protected get canSeek(): boolean {
		return (
			(this.session.snapshot()?.status === 'playing' ||
				this.session.snapshot()?.status === 'paused') &&
			this.session.durationMs() !== null &&
			!this.session.seekPending()
		);
	}

	protected get isPlaying(): boolean {
		return this.session.snapshot()?.status === 'playing';
	}

	protected get isPaused(): boolean {
		return this.session.snapshot()?.status === 'paused';
	}

	onSeekInput(event: Event): void {
		this.seekPreviewMs.set(Number((event.target as HTMLInputElement).value));
	}

	async onSeekChange(): Promise<void> {
		const requested = this.seekPreviewMs();
		if (requested === null) return;
		await this.session.seek(requested);
		this.seekPreviewMs.set(null);
	}

	onVolumeInput(event: Event): void {
		this.session.setVolume(Number((event.target as HTMLInputElement).value));
	}

	togglePlayback(): void {
		if (this.isPlaying) void this.session.pause();
		else if (this.isPaused) void this.session.resume();
	}
}
