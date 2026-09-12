import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideDisc, LucideListMusic, LucideSettings, LucideUsersRound } from '@lucide/angular';

@Component({
	imports: [
		LucideDisc,
		LucideListMusic,
		LucideSettings,
		LucideUsersRound,
		RouterLink,
		RouterLinkActive
	],
	selector: 'app-navigation',
	host: { class: 'block min-h-0 app-wide:h-full' },
	templateUrl: './app-navigation.html'
})
export class AppNavigation {
	protected readonly destinations = [
		{ id: 'albums', label: 'Albums', route: '/library/albums' },
		{ id: 'albumArtists', label: 'Album Artists', route: '/library/album-artists' },
		{ id: 'tracks', label: 'Tracks', route: '/library/tracks' }
	] as const;
}
