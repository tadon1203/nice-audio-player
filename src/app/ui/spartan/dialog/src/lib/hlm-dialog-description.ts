import { Directive } from '@angular/core';
import { BrnDialogDescription } from '@spartan-ng/brain/dialog';
import { classes } from '@app/ui/spartan/utils';

@Directive({
	selector: '[hlmDialogDescription]',
	hostDirectives: [BrnDialogDescription],
	host: { 'data-slot': 'dialog-description' }
})
export class HlmDialogDescription {
	constructor() {
		classes(() => 'text-body text-content-secondary');
	}
}
