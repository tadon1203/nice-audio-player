import type { PlaybackState } from '@shared/native-app-api';
import { formatPlaybackStatus } from './playback-status-bar';

const stopped: PlaybackState = {
	status: 'stopped',
	revision: 1,
	file: null,
	volume: 1,
	muted: false,
	outputSelection: { kind: 'systemDefault' },
	canGoPrevious: false,
	canGoNext: false
};

describe('formatPlaybackStatus', () => {
	it('uses neutral placeholders when playback is stopped', () => {
		expect(formatPlaybackStatus(stopped)).toEqual([
			{ label: 'SOURCE', value: '— · —' },
			{ label: 'SRC', value: '—' },
			{ label: 'OUTPUT', value: '—' }
		]);
	});

	it('exposes source, conversion, and output state for active playback', () => {
		const playing: PlaybackState = {
			status: 'playing',
			revision: 2,
			file: { path: 'C:/Music/track.wav', fileName: 'track.wav', extension: 'wav' },
			playbackId: 'playback-1',
			positionMs: 0,
			durationMs: 120000,
			volume: 1,
			muted: false,
			outputSelection: { kind: 'systemDefault' },
			outputDevice: { id: 'default', name: 'Default' },
			channelConversion: 'none',
			sourceSampleRate: 44100,
			outputSampleRate: 48000,
			resamplingActive: true,
			canGoPrevious: false,
			canGoNext: true
		};

		expect(formatPlaybackStatus(playing)).toEqual([
			{ label: 'SOURCE', value: 'WAV · 44.1 kHz' },
			{ label: 'SRC', value: '44.1 kHz → 48.0 kHz · resampling' },
			{ label: 'OUTPUT', value: 'Default · direct · 48.0 kHz' }
		]);
	});
});
