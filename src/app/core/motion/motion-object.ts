import { Directive, input } from '@angular/core';

@Directive({
	selector: '[appMotionObject]',
	host: {
		'[attr.data-motion-object]': 'id()',
		'[attr.data-flip-id]': 'id()'
	}
})
export class MotionObject {
	readonly id = input.required<string>({ alias: 'appMotionObject' });
}
