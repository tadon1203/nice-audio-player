import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Flip } from 'gsap/Flip';
import { motionTokens } from '../motion-tokens';
import { MotionScope, PendingSharedTransition } from '../motion.types';

gsap.registerPlugin(Flip, CustomEase);
const INTERFACE_EASE = 'nice-interface';
const MOTION_OBJECT_SELECTOR = '[data-motion-object]';
CustomEase.create(INTERFACE_EASE, motionTokens.easing.interface);

export interface InternalMotionScope extends MotionScope {
	dispose(): void;
}

export function createGsapMotionScope(root: HTMLElement): InternalMotionScope {
	const context = gsap.context(() => undefined, root);
	let active: gsap.core.Timeline | null = null;
	const targets = (): HTMLElement[] =>
		Array.from(root.querySelectorAll<HTMLElement>(MOTION_OBJECT_SELECTOR));
	const cancelActive = (): void => {
		active?.revert();
		active = null;
	};
	return {
		beginSharedTransition(): PendingSharedTransition | null {
			if (
				typeof window.matchMedia === 'function' &&
				window.matchMedia('(prefers-reduced-motion: reduce)').matches
			) {
				cancelActive();
				return null;
			}
			const before = targets();
			if (before.length === 0) {
				cancelActive();
				return null;
			}
			const state = Flip.getState(before);
			active = null;
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
						const animation = Flip.from(state, {
							absolute: true,
							duration: motionTokens.durationMs.content / 1000,
							ease: INTERFACE_EASE,
							targets: after,
							onComplete: () => {
								if (active === animation) active = null;
							}
						});
						active = animation;
					});
				}
			};
		},
		dispose(): void {
			active = null;
			context.revert();
		}
	};
}
