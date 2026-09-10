import { Routes } from '@angular/router';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'library' },
	{
		path: 'library',
		loadChildren: () =>
			import('./library/library.routes').then(({ libraryRoutes }) => libraryRoutes)
	},
	{
		path: 'settings',
		loadChildren: () =>
			import('./settings/settings.routes').then(({ settingsRoutes }) => settingsRoutes)
	}
];
