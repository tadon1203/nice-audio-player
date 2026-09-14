import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import type { LibraryRoot } from '@shared/native-app-api';
import { Button } from '@app/ui/button';

@Component({
	imports: [Button],
	template: `
		<div class="w-full max-w-layout-context-pane-width bg-surface-chrome p-region" role="document">
			<h2 class="text-page-title text-content-primary">Remove library folder?</h2>
			<p class="mt-group text-body break-words text-content-primary">{{ data.path }}</p>
			<p class="mt-related text-body text-content-secondary">
				This removes indexed library records for this folder. It does not delete audio files.
			</p>
			<div class="mt-region flex justify-end gap-related">
				<button type="button" appButton="secondary" (click)="dialogRef.close(false)">Cancel</button>
				<button type="button" appButton="danger" (click)="dialogRef.close(true)">Remove</button>
			</div>
		</div>
	`
})
export class RemoveLibraryRootDialog {
	protected readonly data = inject<LibraryRoot>(DIALOG_DATA);
	protected readonly dialogRef = inject(DialogRef) as DialogRef<boolean>;
}
