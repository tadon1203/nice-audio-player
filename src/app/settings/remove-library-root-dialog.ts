import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import type { LibraryRoot } from '@shared/native-app-api';
import { Button } from '@app/ui/button';

@Component({
	imports: [Button],
	template: `
		<div class="w-[min(90vw,32rem)] bg-surface-container-low p-8" role="document">
			<h2 class="font-normal text-headline-small text-on-surface">Remove library folder?</h2>
			<p class="mt-4 text-body-medium break-words text-on-surface">{{ data.path }}</p>
			<p class="mt-3 text-body-small text-secondary">
				This removes indexed library records for this folder. It does not delete audio files.
			</p>
			<div class="mt-8 flex justify-end gap-3">
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
