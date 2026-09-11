import { Pipe, type PipeTransform } from '@angular/core';

@Pipe({ name: 'formatDuration', pure: true })
export class FormatDurationPipe implements PipeTransform {
	transform(value: number | null): string {
		if (value === null) return '—';
		const totalSeconds = Math.floor(Math.max(0, value) / 1000);
		const seconds = totalSeconds % 60;
		const minutes = Math.floor(totalSeconds / 60);
		if (minutes < 60) return `${minutes}:${seconds.toString().padStart(2, '0')}`;
		const hours = Math.floor(minutes / 60);
		return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}
}
