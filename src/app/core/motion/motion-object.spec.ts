import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { MotionObject } from './motion-object';

describe('MotionObject', () => {
	it('mirrors semantic identity to both motion attributes', async () => {
		@Component({
			imports: [MotionObject],
			template: '<div [appMotionObject]="\'album:1:artwork\'"></div>'
		})
		class Host {}
		await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
		const fixture = TestBed.createComponent(Host);
		fixture.detectChanges();
		const root = fixture.nativeElement as HTMLElement;
		const element = root.querySelector('div');
		expect(element).not.toBeNull();
		if (!element) return;

		expect(element.getAttribute('data-motion-object')).toBe('album:1:artwork');
		expect(element.getAttribute('data-flip-id')).toBe('album:1:artwork');
	});
});
