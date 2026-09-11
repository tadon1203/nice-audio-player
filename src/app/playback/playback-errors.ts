import { readBackendError } from '@app/core/backend/backend-error';

const messages: Record<string, string> = {
	noOutputDevice: 'No audio output device is available.',
	outputDeviceUnavailable: 'The selected output device is unavailable.',
	unsupportedOutputConfiguration: 'The output device configuration is unsupported.',
	outputStreamBuildFailed: 'The audio output could not be prepared.',
	outputStreamStartFailed: 'The audio output could not be started.',
	outputStreamPauseFailed: 'The audio output could not be paused.',
	outputStreamResumeFailed: 'The audio output could not be resumed.',
	outputStreamRuntimeFailed: 'The audio output stopped unexpectedly.',
	completionTimingFailed: 'Playback completion could not be determined.',
	decodeFailed: 'The audio file could not be decoded.',
	sampleRateConversionFailed: 'The audio could not be converted.'
};

export function playbackCommandErrorMessage(error: unknown): string {
	const details = readBackendError(error);
	return (details.code && messages[details.code]) ?? 'Playback could not be started.';
}
