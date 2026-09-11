import { Component } from '@angular/core';

@Component({
	selector: 'app-page-frame',
	host: {
		class: 'mx-auto block w-full max-w-[var(--content-max-width)] px-[var(--layout-inline-padding)]'
	},
	template: '<ng-content />'
})
export class PageFrame {}
