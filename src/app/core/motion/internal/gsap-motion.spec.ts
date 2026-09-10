import { Flip } from 'gsap/Flip';
import { gsap } from 'gsap';
import { createGsapMotionScope } from './gsap-motion';

describe('createGsapMotionScope', () => {
	let root: HTMLElement;

	beforeEach(() => {
		root = document.createElement('div');
		root.innerHTML = '<div data-motion-object="album:1:artwork"></div>';
		document.body.append(root);
	});

	afterEach(() => {
		root.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('does not start a shared transition when motion is reduced', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: true }));
		const from = vi.spyOn(Flip, 'from');
		const scope = createGsapMotionScope(root);

		expect(scope.beginSharedTransition()).toBeNull();
		expect(from).not.toHaveBeenCalled();
		scope.dispose();
	});

	it('returns null when there are no motion objects', () => {
		root.innerHTML = '';
		const scope = createGsapMotionScope(root);

		expect(scope.beginSharedTransition()).toBeNull();
		scope.dispose();
	});

	it('reads the current state before starting a replacement transition', () => {
		const getState = vi
			.spyOn(Flip, 'getState')
			.mockReturnValue({} as ReturnType<typeof Flip.getState>);
		const from = vi.spyOn(Flip, 'from').mockReturnValue(gsap.timeline());
		const scope = createGsapMotionScope(root);
		const first = scope.beginSharedTransition();
		first?.complete();
		const second = scope.beginSharedTransition();

		expect(second).not.toBeNull();
		expect(getState).toHaveBeenCalledTimes(2);
		expect(from).toHaveBeenCalledTimes(1);
		scope.dispose();
	});

	it('reverts its GSAP context on disposal', () => {
		const revert = vi.fn();
		vi.spyOn(gsap, 'context').mockReturnValue({ revert } as unknown as gsap.Context);
		const scope = createGsapMotionScope(root);

		scope.dispose();

		expect(revert).toHaveBeenCalled();
	});
});
