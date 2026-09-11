import { Component, inject } from '@angular/core';
import { PageFrame } from '@app/ui/page-frame';
import { LibraryFoldersSection } from './library-folders-section';
import { LibraryRootsStore } from './library-roots-store';

@Component({
	imports: [LibraryFoldersSection, PageFrame],
	providers: [LibraryRootsStore],
	selector: 'app-settings-page',
	host: {
		class: 'block h-full min-h-0 min-w-0 overflow-hidden',
		'data-page': 'settings'
	},
	templateUrl: './settings-page.html'
})
export class SettingsPage {
	private readonly roots = inject(LibraryRootsStore);

	constructor() {
		void this.roots.load();
	}
}
