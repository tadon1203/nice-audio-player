import { Component } from '@angular/core';

@Component({
	selector: 'app-page-frame',
	host: {
		class: 'box-border mx-auto block min-w-0 w-full max-w-layout-reference-width px-layout-inline'
	},
	template: '<ng-content />'
})
export class PageFrame {}
