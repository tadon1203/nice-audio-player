import { Component } from '@angular/core';
import type { LibraryRoot } from '@shared/native-app-api';
import { HlmButton } from '@app/ui/spartan/button';
import {
	HlmDialogImports,
	injectUiDialogContext,
	injectUiDialogRef,
	type UiDialogRef
} from '@app/ui/spartan/dialog';

@Component({
	imports: [HlmButton, ...HlmDialogImports],
	template: `
		<div hlmDialogHeader>
			<h2 hlmDialogTitle class="text-page-title text-content-primary">Remove library folder?</h2>
		</div>
		<p class="mt-group text-body break-words text-content-primary">{{ data.path }}</p>
		<p hlmDialogDescription class="mt-related text-body text-content-secondary">
			This removes indexed library records for this folder. It does not delete audio files.
		</p>
		<div hlmDialogFooter class="mt-region flex justify-end gap-related">
			<button type="button" hlmBtn variant="outline" (click)="dialogRef.close(false)">
				Cancel
			</button>
			<button type="button" hlmBtn variant="destructive" (click)="dialogRef.close(true)">
				Remove
			</button>
		</div>
	`
})
export class RemoveLibraryRootDialog {
	protected readonly data = injectUiDialogContext<LibraryRoot>();
	protected readonly dialogRef: UiDialogRef<boolean> = injectUiDialogRef<boolean>();
}
