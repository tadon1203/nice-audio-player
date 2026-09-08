import type { NativeAppApi } from '@shared/native-app-api';

declare global {
	interface Window {
		app?: NativeAppApi;
	}
}

export {};
