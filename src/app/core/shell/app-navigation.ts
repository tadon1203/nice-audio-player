import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
	imports: [RouterLink, RouterLinkActive],
	selector: 'app-navigation',
	host: { class: 'block min-h-0 app-wide:h-full' },
	templateUrl: './app-navigation.html'
})
export class AppNavigation {
	protected readonly destinations = [
		{ label: 'Library', route: '/library' },
		{ label: 'Settings', route: '/settings' }
	] as const;
}
