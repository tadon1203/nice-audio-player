import { Component } from '@angular/core';
import { RouteMotion } from '../motion/route-motion';
import { AppNavigation } from './app-navigation';
import { PlaybackDock } from '@app/playback/playback-dock';

@Component({
	imports: [AppNavigation, PlaybackDock, RouteMotion],
	selector: 'app-shell',
	host: {
		class: 'grid h-dvh w-full grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-canvas',
		'data-testid': 'app-shell'
	},
	templateUrl: './app-shell.html'
})
export class AppShell {}
