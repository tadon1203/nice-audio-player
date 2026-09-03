import type { AppEvent, NativeAppApi } from './contracts';

export function getAppApi(): NativeAppApi {
	if (typeof window === 'undefined' || !window.app) {
		throw new Error('Native application API is unavailable');
	}
	return window.app;
}

export function isAppEvent(value: unknown): value is AppEvent {
	return (
		typeof value === 'object' &&
		value !== null &&
		'event' in value &&
		typeof value.event === 'string'
	);
}

export function ping(api: NativeAppApi): Promise<string> {
	return api.ping();
}
