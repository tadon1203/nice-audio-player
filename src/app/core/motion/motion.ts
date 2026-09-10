import { DestroyRef, Service } from '@angular/core';
import { createGsapMotionScope } from './internal/gsap-motion';
import { MotionScope } from './motion.types';

@Service()
export class Motion {
	createScope(root: HTMLElement, destroyRef: DestroyRef): MotionScope {
		const scope = createGsapMotionScope(root);
		destroyRef.onDestroy(() => {
			scope.dispose();
		});
		return scope;
	}
}
