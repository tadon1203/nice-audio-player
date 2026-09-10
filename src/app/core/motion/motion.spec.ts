import { DestroyRef } from '@angular/core';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { motionTokens } from './motion-tokens';
import { Motion } from './motion';

describe('Motion', () => {
	let root: HTMLElement;
	let destroy: (() => void) | undefined;
	let motion: Motion;

	beforeEach(() => {
		root = document.createElement('div');
		root.innerHTML = '<div data-motion-object="album:1:artwork"></div>';
		document.body.append(root);
		destroy = undefined;
		motion = new Motion();
	});

	afterEach(() => {
		destroy?.();
		root.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	function createScope() {
		return motion.createScope(root, {
			onDestroy(callback: () => void): void {
				destroy = callback;
			}
		} as DestroyRef);
	}

	it('returns null when there are no motion objects', () => {
		root.innerHTML = '';

		expect(createScope().beginSharedTransition()).toBeNull();
	});

	it('kills existing flips and returns null when motion is reduced', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: true }));
		const killFlipsOf = vi.spyOn(Flip, 'killFlipsOf');

		expect(createScope().beginSharedTransition()).toBeNull();
		expect(killFlipsOf).toHaveBeenCalledWith(
			Array.from(root.querySelectorAll<HTMLElement>('[data-motion-object]'))
		);
	});

	it('reads state for each transition without manually killing interruptions', () => {
		const getState = vi
			.spyOn(Flip, 'getState')
			.mockReturnValue({} as ReturnType<typeof Flip.getState>);
		const killFlipsOf = vi.spyOn(Flip, 'killFlipsOf');
		vi.spyOn(Flip, 'from').mockReturnValue(gsap.timeline());
		const scope = createScope();

		scope.beginSharedTransition()?.complete();
		scope.beginSharedTransition();

		expect(getState).toHaveBeenCalledTimes(2);
		expect(killFlipsOf).not.toHaveBeenCalled();
	});

	it('does not animate a cancelled transition', () => {
		vi.spyOn(Flip, 'getState').mockReturnValue({} as ReturnType<typeof Flip.getState>);
		const from = vi.spyOn(Flip, 'from');
		const pending = createScope().beginSharedTransition();

		pending?.cancel();
		pending?.complete();

		expect(from).not.toHaveBeenCalled();
	});

	it('animates the targets present after rendering', () => {
		vi.spyOn(Flip, 'getState').mockReturnValue({} as ReturnType<typeof Flip.getState>);
		const from = vi.spyOn(Flip, 'from').mockReturnValue(gsap.timeline());
		const pending = createScope().beginSharedTransition();
		root.innerHTML = '<div data-motion-object="album:1:artwork"></div>';
		const after = root.querySelectorAll<HTMLElement>('[data-motion-object]');

		pending?.complete();

		expect(from).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				absolute: true,
				duration: motionTokens.durationMs.content / 1000,
				ease: 'nice-interface',
				targets: Array.from(after)
			})
		);
	});

	it('reverts the GSAP context when its DestroyRef is destroyed', () => {
		const revert = vi.fn();
		vi.spyOn(gsap, 'context').mockReturnValue({ revert } as unknown as gsap.Context);

		createScope();
		destroy?.();

		expect(revert).toHaveBeenCalledTimes(1);
	});
});
