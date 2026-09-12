import { Component, computed, inject } from '@angular/core';
import type { PlaybackState } from '@shared/native-app-api';
import { PlaybackSession } from './playback-session';

export interface PlaybackStatusLine {
	readonly label: 'SOURCE' | 'SRC' | 'OUTPUT';
	readonly value: string;
}

type ActivePlaybackState = Extract<PlaybackState, { status: 'playing' | 'paused' }>;

function isActivePlayback(snapshot: PlaybackState | null): snapshot is ActivePlaybackState {
	return snapshot?.status === 'playing' || snapshot?.status === 'paused';
}

function formatRate(rate: number | null | undefined): string {
	return rate === null || rate === undefined || !Number.isFinite(rate)
		? '—'
		: `${(rate / 1000).toFixed(1)} kHz`;
}

function formatConversion(snapshot: ActivePlaybackState): string {
	switch (snapshot.channelConversion) {
		case 'monoToStereo':
			return 'mono → stereo';
		case 'stereoToMono':
			return 'stereo → mono';
		case 'none':
			return 'direct';
	}
}

export function formatPlaybackStatus(
	snapshot: PlaybackState | null
): readonly PlaybackStatusLine[] {
	const active = isActivePlayback(snapshot);
	const sourceExtension = snapshot?.file?.extension ? snapshot.file.extension.toUpperCase() : '—';
	const sourceRate = active ? formatRate(snapshot.sourceSampleRate) : '—';
	const outputRate = active ? formatRate(snapshot.outputSampleRate) : '—';

	return [
		{ label: 'SOURCE', value: `${sourceExtension} · ${sourceRate}` },
		{
			label: 'SRC',
			value: active
				? `${sourceRate} → ${outputRate} · ${snapshot.resamplingActive ? 'resampling' : 'direct'}`
				: '—'
		},
		{
			label: 'OUTPUT',
			value: active
				? `${snapshot.outputDevice.name || '—'} · ${formatConversion(snapshot)} · ${outputRate}`
				: '—'
		}
	] as const;
}

@Component({
	selector: 'app-playback-status-bar',
	host: { class: 'block min-w-0' },
	template: `
		<section
			class="grid h-full min-w-0 grid-cols-3 items-center divide-x divide-border-subtle/60 border-t border-border-subtle bg-status-surface px-[var(--shell-dock-inline-padding)] text-status text-text-secondary"
			aria-label="Playback signal status"
			data-testid="playback-status-bar"
		>
			@for (line of statusLines(); track line.label) {
				<div class="min-w-0 truncate" [attr.data-status-line]="line.label">
					<span class="text-text-secondary">{{ line.label }}</span>
					<span class="ms-2 tabular-nums">{{ line.value }}</span>
				</div>
			}
		</section>
	`
})
export class PlaybackStatusBar {
	private readonly session = inject(PlaybackSession);
	protected readonly statusLines = computed(() => formatPlaybackStatus(this.session.snapshot()));
}
