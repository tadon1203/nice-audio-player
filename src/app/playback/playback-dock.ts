import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
	lucidePause,
	lucidePlay,
	lucideSkipBack,
	lucideSkipForward,
	lucideVolume2,
	lucideVolumeX
} from '@ng-icons/lucide';
import { HlmButton } from '@app/ui/spartan/button';
import { Artwork } from '@app/ui/artwork';
import { FormatDurationPipe } from '@app/ui/format-duration';
import { RangeControl } from '@app/ui/range-control';
import { PlaybackSession } from './playback-session';

export function formatVolumeDb(volume: number): string {
	const normalized = Math.max(0, Math.min(1, volume));
	return normalized === 0 ? '−∞ dB' : `${(20 * Math.log10(normalized)).toFixed(1)} dB`;
}

@Component({
	imports: [Artwork, HlmButton, FormatDurationPipe, RangeControl, NgIcon],
	providers: [
		provideIcons({
			lucidePause,
			lucidePlay,
			lucideSkipBack,
			lucideSkipForward,
			lucideVolume2,
			lucideVolumeX
		})
	],
	selector: 'app-playback-dock',
	host: { class: 'block h-full min-h-0 min-w-0' },
	styleUrl: './playback-dock.css',
	templateUrl: './playback-dock.html'
})
export class PlaybackDock {
	protected readonly session = inject(PlaybackSession);
	protected readonly seekPreviewMs = signal<number | null>(null);
	protected readonly seekValue = computed(() => this.seekPreviewMs() ?? this.session.positionMs());
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

	async onSeekCommit(value: number): Promise<void> {
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
