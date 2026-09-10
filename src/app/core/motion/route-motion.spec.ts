import { Component } from '@angular/core';
import {
	NavigationCancel,
	NavigationError,
	NavigationSkipped,
	NavigationStart,
	Router,
	RouterEvent
} from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { Motion } from './motion';
import { PendingSharedTransition } from './motion.types';
import { RouteMotion } from './route-motion';

describe('RouteMotion', () => {
	it('cleans up pending transitions and completes after activation', async () => {
		const events = new Subject<RouterEvent>();
		const complete = vi.fn();
		const cancel = vi.fn();
		const pending: PendingSharedTransition = { complete, cancel };
		const scope = { beginSharedTransition: vi.fn(() => pending), dispose: vi.fn() };
		const router = { events } as unknown as Router;

		@Component({ template: '' })
		class TestHost {}

		await TestBed.configureTestingModule({
			imports: [RouteMotion, TestHost],
			providers: [
				{ provide: Router, useValue: router },
				{ provide: Motion, useValue: { createScope: () => scope } }
			]
		})
			.overrideComponent(RouteMotion, { set: { template: '' } })
			.compileComponents();
		const fixture = TestBed.createComponent(RouteMotion);
		fixture.detectChanges();

		events.next(new NavigationStart(1, '/page', 'imperative'));
		expect(scope.beginSharedTransition.mock.calls.length).toBe(1);
		events.next(new NavigationCancel(1, '/page', 'cancelled'));
		events.next(new NavigationStart(2, '/error', 'imperative'));
		events.next(new NavigationError(2, '/error', new Error('failed')));
		events.next(new NavigationStart(3, '/skipped', 'imperative'));
		events.next(new NavigationSkipped(3, '/skipped', 'skipped'));
		expect(cancel.mock.calls.length).toBe(3);

		events.next(new NavigationStart(4, '/next', 'imperative'));
		(fixture.componentInstance as unknown as { onActivate(): void }).onActivate();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(complete.mock.calls.length).toBe(1);
		fixture.destroy();
	});
});
