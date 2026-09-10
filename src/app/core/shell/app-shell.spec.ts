import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppShell } from './app-shell';

describe('AppShell', () => {
	it('composes the persistent workspace and route outlet', async () => {
		await TestBed.configureTestingModule({
			imports: [AppShell],
			providers: [provideRouter([])]
		}).compileComponents();
		const fixture = TestBed.createComponent(AppShell);
		fixture.detectChanges();
		const root = fixture.nativeElement as HTMLElement;

		expect(root.querySelector('app-navigation')).not.toBeNull();
		expect(root.querySelector('app-route-motion')).not.toBeNull();
	});
});
