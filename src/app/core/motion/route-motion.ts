import {
	afterNextRender,
	Component,
	DestroyRef,
	ElementRef,
	Injector,
	inject
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	NavigationCancel,
	NavigationError,
	NavigationSkipped,
	NavigationStart,
	Router,
	RouterOutlet
} from '@angular/router';
import { Motion } from './motion';
import { PendingSharedTransition } from './motion.types';

@Component({
	imports: [RouterOutlet],
	selector: 'app-route-motion',
	host: { class: 'block h-full min-h-0 min-w-0 overflow-hidden' },
	template: '<router-outlet (activate)="onActivate()" />'
})
export class RouteMotion {
	private readonly router = inject(Router);
	private readonly destroyRef = inject(DestroyRef);
	private readonly injector = inject(Injector);
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly scope = inject(Motion).createScope(this.host.nativeElement, this.destroyRef);
	private pending: PendingSharedTransition | null = null;

	constructor() {
		this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
			if (event instanceof NavigationStart) {
				this.pending?.cancel();
				this.pending = this.scope.beginSharedTransition();
				return;
			}
			if (
				event instanceof NavigationCancel ||
				event instanceof NavigationError ||
				event instanceof NavigationSkipped
			) {
				this.pending?.cancel();
				this.pending = null;
			}
		});
	}

	protected onActivate(): void {
		const pending = this.pending;
		if (!pending) return;
		afterNextRender(
			{
				mixedReadWrite: () => {
					if (this.pending !== pending) return;
					pending.complete();
					this.pending = null;
				}
			},
			{ injector: this.injector }
		);
	}
}
