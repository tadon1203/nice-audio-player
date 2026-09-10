import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { routes } from '../../app.routes';
import { AppNavigation } from './app-navigation';

describe('AppNavigation', () => {
	it('renders routed destinations with exclusive active visual state', async () => {
		await TestBed.configureTestingModule({
			imports: [AppNavigation],
			providers: [provideRouter(routes)]
		}).compileComponents();
		const fixture = TestBed.createComponent(AppNavigation);
		await TestBed.inject(Router).navigateByUrl('/library');
		fixture.detectChanges();
		const host = fixture.nativeElement as HTMLElement;
		const navigation = host.querySelector('nav');
		expect(host.classList.contains('app-wide:h-full')).toBe(true);
		expect(navigation?.classList.contains('app-wide:h-full')).toBe(true);
		let links = Array.from(host.querySelectorAll('a'));

		expect(links).toHaveLength(2);
		expect(links[0].getAttribute('href')).toBe('/library');
		expect(links[1].getAttribute('href')).toBe('/settings');
		expect(links[0].getAttribute('aria-current')).toBe('page');
		expect(links[0].classList.contains('text-text-primary')).toBe(true);
		expect(links[0].classList.contains('text-text-secondary')).toBe(false);
		expect(links[1].classList.contains('text-text-primary')).toBe(false);
		expect(links[1].classList.contains('text-text-secondary')).toBe(true);

		await TestBed.inject(Router).navigateByUrl('/settings');
		fixture.detectChanges();
		links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'));
		expect(links[0].classList.contains('text-text-secondary')).toBe(true);
		expect(links[1].classList.contains('text-text-primary')).toBe(true);
		expect(links[1].classList.contains('text-text-secondary')).toBe(false);
	});
});
