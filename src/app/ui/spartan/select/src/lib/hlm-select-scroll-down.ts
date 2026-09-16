import { Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { BrnSelectScrollDown } from '@spartan-ng/brain/select';
import { classes } from '@app/ui/spartan/utils';

@Component({
	selector: 'hlm-select-scroll-down',
	imports: [NgIcon],
	providers: [provideIcons({ lucideChevronDown })],
	hostDirectives: [BrnSelectScrollDown],
	template: ` <ng-icon name="lucideChevronDown" class="size-icon-small text-icon-small" /> `
})
export class HlmSelectScrollDown {
	constructor() {
		classes(
			() =>
				'bg-popover z-10 flex cursor-default items-center justify-center py-1 sticky bottom-0 w-full data-hidden:hidden'
		);
	}
}
