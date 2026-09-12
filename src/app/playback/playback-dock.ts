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
import { RangeControl } from '@app/ui/range-control';
import { PlaybackSession } from './playback-session';

export function formatVolumeDb(volume: number): string {
	const normalized = Math.max(0, Math.min(1, volume));
	return normalized === 0 ? '−∞ dB' : `${(20 * Math.log10(normalized)).toFixed(1)} dB`;
}

@Component({
	imports: [
		Artwork,
		Button,
		FormatDurationPipe,
		RangeControl,
		LucidePause,
		LucidePlay,
		LucideSkipBack,
		LucideSkipForward,
		LucideVolume2,
		LucideVolumeX
	],
	selector: 'app-playback-dock',
	host: { class: 'block h-full min-h-0 min-w-0' },
	templateUrl: './playback-dock.html'
})
export class PlaybackDock {
	protected readonly session = inject(PlaybackSession);
	protected readonly seekPreviewMs = signal<number | null>(null);
	protected readonly seekValue = computed(() => this.seekPreviewMs() ?? this.session.positionMs());
	protected readonly progressPercent = computed(() => {
		const duration = this.session.durationMs();
		if (duration === null || duration <= 0) return 0;
		return Math.min(100, Math.max(0, (this.seekValue() / duration) * 100));
	});
	protected readonly volumePercent = computed(() => this.session.volume() * 100);
	protected readonly volumeDb = computed(() =>
		this.session.muted() ? '−∞ dB' : formatVolumeDb(this.session.volume())
	);

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

	onSeekInput(value: number): void {
		this.seekPreviewMs.set(value);
	}

	async onSeekChange(value: number): Promise<void> {
		try {
			await this.session.seek(value);
		} finally {
			this.seekPreviewMs.set(null);
		}
	}

	onVolumeInput(value: number): void {
		this.session.setVolume(value);
		if (this.session.muted() && !this.session.mutePending()) void this.session.toggleMute();
	}

	togglePlayback(): void {
		if (this.isPlaying) void this.session.pause();
		else if (this.isPaused) void this.session.resume();
	}
}
