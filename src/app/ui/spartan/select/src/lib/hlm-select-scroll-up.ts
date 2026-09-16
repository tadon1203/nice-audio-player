import { Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronUp } from '@ng-icons/lucide';
import { BrnSelectScrollUp } from '@spartan-ng/brain/select';
import { classes } from '@app/ui/spartan/utils';

@Component({
	selector: 'hlm-select-scroll-up',
	imports: [NgIcon],
	providers: [provideIcons({ lucideChevronUp })],
	hostDirectives: [BrnSelectScrollUp],
	template: ` <ng-icon name="lucideChevronUp" class="size-icon-small text-icon-small" /> `
})
export class HlmSelectScrollUp {
	constructor() {
		classes(
			() =>
				'bg-popover z-10 flex cursor-default items-center justify-center py-1 sticky top-0 w-full data-hidden:hidden'
		);
	}
}
