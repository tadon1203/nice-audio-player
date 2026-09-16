import { Directive } from '@angular/core';
import { classes } from '@app/ui/spartan/utils';

@Directive({
	selector: '[hlmDialogFooter],hlm-dialog-footer',
	host: { 'data-slot': 'dialog-footer' }
})
export class HlmDialogFooter {
	constructor() {
		classes(() => 'mt-region flex flex-row justify-end gap-related');
	}
}
