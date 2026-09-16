import { inject } from '@angular/core';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

export type UiDialogRef<TResult = unknown> = BrnDialogRef<TResult>;

export function injectUiDialogContext<T>(): T {
	return injectBrnDialogContext<T>();
}

export function injectUiDialogRef<TResult>(): UiDialogRef<TResult> {
	return inject(BrnDialogRef) as UiDialogRef<TResult>;
}
