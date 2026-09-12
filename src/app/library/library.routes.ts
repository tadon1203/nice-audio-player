import { Routes } from '@angular/router';
import { LibraryPage } from './library-page';

export const libraryRoutes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'albums' },
	{ path: 'albums', component: LibraryPage, data: { presentation: 'albums' }, title: 'Albums' },
	{
		path: 'album-artists',
		component: LibraryPage,
		data: { presentation: 'albumArtists' },
		title: 'Album Artists'
	},
	{ path: 'tracks', component: LibraryPage, data: { presentation: 'tracks' }, title: 'Tracks' }
];
