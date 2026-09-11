export interface BackendErrorDetails {
	readonly code: string | null;
	readonly message: string;
}

export function readBackendError(error: unknown): BackendErrorDetails {
	if (error instanceof Error) {
		const code = 'code' in error && typeof error.code === 'string' ? error.code : null;
		return { code, message: error.message };
	}
	return { code: null, message: 'Unexpected application error.' };
}
