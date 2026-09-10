import { Component } from '@angular/core';
import { RouteMotion } from '../motion/route-motion';
import { AppNavigation } from './app-navigation';

@Component({
	imports: [AppNavigation, RouteMotion],
	selector: 'app-shell',
	templateUrl: './app-shell.html'
})
export class AppShell {}
