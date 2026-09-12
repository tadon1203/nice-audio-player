import { Component } from '@angular/core';

@Component({
	selector: 'app-page-frame',
	host: {
		class: 'mx-auto block w-full max-w-layout-content-max px-layout-inline'
	},
	template: '<ng-content />'
})
export class PageFrame {}
