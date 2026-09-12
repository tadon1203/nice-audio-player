import { formatVolumeDb } from './playback-dock';

describe('formatVolumeDb', () => {
	it('formats linear volume as decibels', () => {
		expect(formatVolumeDb(1)).toBe('0.0 dB');
		expect(formatVolumeDb(0.125)).toBe('-18.1 dB');
	});

	it('uses negative infinity for silence and clamps invalid bounds', () => {
		expect(formatVolumeDb(0)).toBe('−∞ dB');
		expect(formatVolumeDb(-1)).toBe('−∞ dB');
		expect(formatVolumeDb(2)).toBe('0.0 dB');
	});
});
