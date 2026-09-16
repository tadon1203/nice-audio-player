import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDisc, lucideListMusic, lucideSettings, lucideUsersRound } from '@ng-icons/lucide';

@Component({
	imports: [NgIcon, RouterLink, RouterLinkActive],
	providers: [provideIcons({ lucideDisc, lucideListMusic, lucideSettings, lucideUsersRound })],
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
