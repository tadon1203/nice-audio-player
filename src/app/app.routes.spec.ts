import { Location } from '@angular/common';
import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { routes } from './app.routes';

describe('app routes', () => {
	it('redirects the root and resolves the feature routes', async () => {
		TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
		const router = TestBed.inject(Router);
		const location = TestBed.inject(Location);

		await router.navigateByUrl('/');
		expect(location.path()).toBe('/library');
		await router.navigateByUrl('/settings');
		expect(location.path()).toBe('/settings');
	});
});
