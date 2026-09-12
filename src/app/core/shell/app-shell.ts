import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppNavigation } from './app-navigation';
import { PlaybackDock } from '@app/playback/playback-dock';
import { PlaybackStatusBar } from '@app/playback/playback-status-bar';

@Component({
	imports: [AppNavigation, PlaybackDock, PlaybackStatusBar, RouterOutlet],
	selector: 'app-shell',
	host: {
		class: 'block h-dvh w-full overflow-hidden bg-surface-container-lowest',
		'data-testid': 'app-shell'
	},
	templateUrl: './app-shell.html'
})
export class AppShell {}
