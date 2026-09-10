import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { routes } from '@app/app.routes';
import { AppNavigation } from './app-navigation';

describe('AppNavigation', () => {
	it('renders routed destinations with exclusive active route state', async () => {
		await TestBed.configureTestingModule({
			imports: [AppNavigation],
			providers: [provideRouter(routes)]
		}).compileComponents();
		const fixture = TestBed.createComponent(AppNavigation);
		await TestBed.inject(Router).navigateByUrl('/library');
		fixture.detectChanges();
		let links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'));

		expect(links).toHaveLength(2);
		expect(links[0].getAttribute('href')).toBe('/library');
		expect(links[1].getAttribute('href')).toBe('/settings');
		expect(links[0].getAttribute('aria-current')).toBe('page');

		await TestBed.inject(Router).navigateByUrl('/settings');
		fixture.detectChanges();
		links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'));
		expect(links[1].getAttribute('aria-current')).toBe('page');
		expect(links[0].getAttribute('aria-current')).toBeNull();
	});
});
