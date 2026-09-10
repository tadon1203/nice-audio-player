import { DestroyRef, Service } from '@angular/core';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Flip } from 'gsap/Flip';
import { motionTokens } from './motion-tokens';

gsap.registerPlugin(Flip, CustomEase);

const INTERFACE_EASE = 'nice-interface';
const MOTION_OBJECT_SELECTOR = '[data-motion-object]';

CustomEase.create(INTERFACE_EASE, motionTokens.easing.interface);

export interface PendingSharedTransition {
	complete(): void;
	cancel(): void;
}

@Service()
export class Motion {
	createScope(root: HTMLElement, destroyRef: DestroyRef) {
		const context = gsap.context(() => undefined, root);
		const targets = (): HTMLElement[] =>
			Array.from(root.querySelectorAll<HTMLElement>(MOTION_OBJECT_SELECTOR));

		destroyRef.onDestroy(() => {
			context.revert();
		});

		return {
			beginSharedTransition(): PendingSharedTransition | null {
				const before = targets();
				if (
					typeof window.matchMedia === 'function' &&
					window.matchMedia('(prefers-reduced-motion: reduce)').matches
				) {
					Flip.killFlipsOf(before);
					return null;
				}
				if (before.length === 0) return null;

				const state = Flip.getState(before);
				let cancelled = false;
				return {
					cancel(): void {
						cancelled = true;
					},
					complete(): void {
						if (cancelled) return;
						const after = targets();
						if (after.length === 0) return;
						context.add(() => {
							Flip.from(state, {
								absolute: true,
								duration: motionTokens.durationMs.content / 1000,
								ease: INTERFACE_EASE,
								targets: after
							});
						});
					}
				};
			}
		};
	}
}
