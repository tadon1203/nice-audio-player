import { Component, computed, input, signal } from '@angular/core';
import type { ArtworkRef } from '@shared/native-app-api';
import { artworkUrl } from '@app/core/backend/artwork-url';

@Component({
	selector: 'app-artwork',
	host: { class: 'block aspect-square overflow-hidden bg-surface-raised' },
	template: `
		@if (url() && failedUrl() !== url()) {
			<img
				[src]="url()!"
				[alt]="alt()"
				[loading]="loading()"
				(error)="failedUrl.set(url())"
				class="h-full w-full object-cover"
			/>
		} @else {
			<span aria-hidden="true" class="block h-full w-full bg-surface-raised"></span>
		}
	`
})
export class Artwork {
	readonly artwork = input<ArtworkRef | null>(null);
	readonly alt = input('');
	readonly loading = input<'eager' | 'lazy'>('lazy');
	readonly url = computed(() => artworkUrl(this.artwork()));
	readonly failedUrl = signal<string | null>(null);
}
