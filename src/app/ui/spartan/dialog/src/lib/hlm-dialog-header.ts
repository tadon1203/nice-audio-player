import { Directive } from '@angular/core';
import { classes } from '@app/ui/spartan/utils';

@Directive({
	selector: '[hlmDialogHeader],hlm-dialog-header',
	host: { 'data-slot': 'dialog-header' }
})
export class HlmDialogHeader {
	constructor() {
		classes(() => 'gap-related flex flex-col');
	}
}
