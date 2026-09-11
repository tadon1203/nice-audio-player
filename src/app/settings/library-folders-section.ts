import { Component, DestroyRef, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { LibraryRoot } from '@shared/native-app-api';
import { Button } from '@app/ui/button';
import { LibrarySession } from '@app/library/library-session';
import { LibraryRootsStore } from './library-roots-store';
import { RemoveLibraryRootDialog } from './remove-library-root-dialog';

@Component({
	imports: [Button],
	selector: 'app-library-folders-section',
	templateUrl: './library-folders-section.html'
})
export class LibraryFoldersSection {
	protected readonly roots = inject(LibraryRootsStore);
	protected readonly library = inject(LibrarySession);
	private readonly dialog = inject(Dialog);
	private readonly destroyRef = inject(DestroyRef);

	protected get scanRunning(): boolean {
		return this.library.scan()?.state === 'running';
	}

	addFolder(): void {
		if (!this.scanRunning) void this.roots.addFolder();
	}

	setEnabled(root: LibraryRoot, event: Event): void {
		if (this.scanRunning) return;
		void this.roots.setEnabled(root, (event.target as HTMLInputElement).checked);
	}

	remove(root: LibraryRoot): void {
		if (this.scanRunning) return;
		const ref = this.dialog.open<boolean, LibraryRoot>(RemoveLibraryRootDialog, {
			data: root,
			role: 'alertdialog',
			ariaLabel: 'Remove library folder',
			disableClose: false
		});
		ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((confirmed) => {
			if (confirmed) void this.roots.remove(root);
		});
	}

	rescan(): void {
		if (!this.scanRunning) void this.library.startScan();
	}

	cancelScan(): void {
		if (this.scanRunning) void this.library.cancelScan();
	}
}
