import { z } from 'zod';

const number = z.number().finite();
const nullableNumber = number.nullable();
const nullableString = z.string().nullable();

const protocolErrorSchema = z
	.object({
		code: z.string(),
		message: z.string()
	})
	.strict();

const validatedAudioFileSchema = z
	.object({
		path: z.string(),
		fileName: z.string(),
		extension: z.string()
	})
	.strict();

const outputSelectionSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('systemDefault') }).strict(),
	z.object({ kind: z.literal('device'), deviceId: z.string() }).strict()
]);

const outputDeviceIdentitySchema = z
	.object({
		id: z.string(),
		name: z.string()
	})
	.strict();

const playbackFailureCodeSchema = z.enum([
	'noOutputDevice',
	'outputDeviceUnavailable',
	'unsupportedOutputConfiguration',
	'outputStreamBuildFailed',
	'outputStreamStartFailed',
	'outputStreamPauseFailed',
	'outputStreamResumeFailed',
	'outputStreamRuntimeFailed',
	'completionTimingFailed',
	'decodeFailed',
	'sampleRateConversionFailed'
]);

const playbackSnapshotSchema = z.discriminatedUnion('status', [
	z
		.object({
			status: z.literal('stopped'),
			revision: nullableNumber,
			file: validatedAudioFileSchema.nullable(),
			volume: nullableNumber,
			muted: z.boolean(),
			outputSelection: outputSelectionSchema,
			canGoPrevious: z.boolean(),
			canGoNext: z.boolean()
		})
		.strict(),
	z
		.object({
			status: z.literal('playing'),
			revision: nullableNumber,
			file: validatedAudioFileSchema,
			playbackId: z.string(),
			positionMs: nullableNumber,
			durationMs: nullableNumber,
			volume: nullableNumber,
			muted: z.boolean(),
			outputSelection: outputSelectionSchema,
			outputDevice: outputDeviceIdentitySchema,
			channelConversion: z.enum(['none', 'monoToStereo', 'stereoToMono']),
			sourceSampleRate: number,
			outputSampleRate: number,
			resamplingActive: z.boolean(),
			canGoPrevious: z.boolean(),
			canGoNext: z.boolean()
		})
		.strict(),
	z
		.object({
			status: z.literal('paused'),
			revision: nullableNumber,
			file: validatedAudioFileSchema,
			playbackId: z.string(),
			positionMs: nullableNumber,
			durationMs: nullableNumber,
			volume: nullableNumber,
			muted: z.boolean(),
			outputSelection: outputSelectionSchema,
			outputDevice: outputDeviceIdentitySchema,
			channelConversion: z.enum(['none', 'monoToStereo', 'stereoToMono']),
			sourceSampleRate: number,
			outputSampleRate: number,
			resamplingActive: z.boolean(),
			canGoPrevious: z.boolean(),
			canGoNext: z.boolean()
		})
		.strict(),
	z
		.object({
			status: z.literal('failed'),
			revision: nullableNumber,
			file: validatedAudioFileSchema.nullable(),
			playbackId: nullableString,
			error: playbackFailureCodeSchema,
			volume: nullableNumber,
			muted: z.boolean(),
			outputSelection: outputSelectionSchema,
			canGoPrevious: z.boolean(),
			canGoNext: z.boolean()
		})
		.strict()
]);

const playbackQueueItemSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		artist: nullableString,
		durationMs: nullableNumber
	})
	.strict();

const playbackQueueSchema = z
	.object({
		revision: nullableNumber,
		current: playbackQueueItemSchema.nullable(),
		upcoming: z.array(playbackQueueItemSchema),
		repeatMode: z.enum(['off', 'all', 'one']),
		shuffleEnabled: z.boolean()
	})
	.strict();

const artworkSchema = z
	.object({
		contentHash: z.string().regex(/^[0-9a-f]{64}$/),
		mimeType: z.enum(['jpeg', 'png']),
		relativePath: z.string()
	})
	.strict();

const libraryRootSchema = z
	.object({
		id: z.string(),
		path: z.string(),
		enabled: z.boolean(),
		scanGeneration: number,
		lastSuccessfulScanAtMs: nullableNumber
	})
	.strict();

const libraryStatusSchema = z.discriminatedUnion('status', [
	z.object({ status: z.literal('ready') }).strict(),
	z
		.object({
			status: z.literal('unavailable'),
			reason: z.enum([
				'storageUnavailable',
				'databaseOpenFailed',
				'migrationFailed',
				'schemaTooNew',
				'databaseCorrupt'
			])
		})
		.strict()
]);

const trackSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		artist: nullableString,
		album: nullableString,
		albumArtist: nullableString,
		artwork: artworkSchema.nullable(),
		durationMs: nullableNumber,
		availability: z.enum(['available', 'missing']),
		playable: z.boolean()
	})
	.strict();

const albumKeySchema = z
	.object({
		title: z.string(),
		albumArtist: z.string()
	})
	.strict();

const albumSchema = z
	.object({
		key: albumKeySchema,
		artwork: artworkSchema.nullable(),
		year: nullableNumber
	})
	.strict();

const artistKeySchema = z.object({ name: z.string() }).strict();

const artistSchema = z
	.object({
		key: artistKeySchema,
		artwork: artworkSchema.nullable(),
		albumCount: nullableNumber,
		trackCount: nullableNumber
	})
	.strict();

const albumTrackSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		artist: nullableString,
		trackNumber: nullableNumber,
		discNumber: nullableNumber,
		fileFormat: nullableString,
		bitDepth: nullableNumber,
		sampleRate: nullableNumber,
		durationMs: nullableNumber,
		availability: z.enum(['available', 'missing']),
		playable: z.boolean()
	})
	.strict();

const page = <T extends z.ZodType>(item: T) =>
	z
		.object({
			items: z.array(item),
			totalCount: nullableNumber,
			nextCursor: nullableString
		})
		.strict();

const libraryAlbumDetailsSchema = z
	.object({
		summary: albumSchema,
		date: nullableString,
		trackCount: nullableNumber,
		durationMs: nullableNumber,
		firstPlayableTrackId: nullableString
	})
	.strict();

const libraryScanSchema = z
	.object({
		state: z.enum(['idle', 'running', 'completed', 'cancelled', 'failed']),
		currentRoot: libraryRootSchema.nullable(),
		discoveredCount: nullableNumber,
		inspectedCount: nullableNumber,
		indexedCount: nullableNumber,
		failedCount: nullableNumber,
		failureCode: nullableString
	})
	.strict();

const audioValidationErrorSchema = z.discriminatedUnion('code', [
	z.object({ code: z.literal('emptyPath') }).strict(),
	z.object({ code: z.literal('notFound') }).strict(),
	z.object({ code: z.literal('notAFile') }).strict(),
	z
		.object({
			code: z.literal('unsupportedExtension'),
			details: z.object({ extension: nullableString }).strict()
		})
		.strict(),
	z.object({ code: z.literal('invalidFileName') }).strict()
]);

const validateAudioFileResultSchema = z.union([
	z.object({ Ok: validatedAudioFileSchema }).strict(),
	z.object({ Err: audioValidationErrorSchema }).strict()
]);

const backendResponseSchema = z.discriminatedUnion('method', [
	z.object({ method: z.literal('ping'), result: z.string() }).strict(),
	z.object({ method: z.literal('getPlaybackState'), result: playbackSnapshotSchema }).strict(),
	z.object({ method: z.literal('getPlaybackQueue'), result: playbackQueueSchema }).strict(),
	z.object({ method: z.literal('pausePlayback'), result: playbackSnapshotSchema }).strict(),
	z.object({ method: z.literal('resumePlayback'), result: playbackSnapshotSchema }).strict(),
	z.object({ method: z.literal('previousPlayback'), result: playbackSnapshotSchema }).strict(),
	z.object({ method: z.literal('nextPlayback'), result: playbackSnapshotSchema }).strict(),
	z.object({ method: z.literal('seekPlayback'), result: playbackSnapshotSchema }).strict(),
	z.object({ method: z.literal('setPlaybackVolume'), result: playbackSnapshotSchema }).strict(),
	z.object({ method: z.literal('setPlaybackMuted'), result: playbackSnapshotSchema }).strict(),
	z
		.object({
			method: z.literal('listAudioOutputDevices'),
			result: z.array(
				z.object({ id: z.string(), name: z.string(), isDefault: z.boolean() }).strict()
			)
		})
		.strict(),
	z
		.object({
			method: z.literal('getApplicationActivities'),
			result: z.array(
				z
					.object({
						id: z.string(),
						kind: z.literal('librarySync'),
						state: z.enum(['running', 'attentionRequired'])
					})
					.strict()
			)
		})
		.strict(),
	z.object({ method: z.literal('getLibraryStatus'), result: libraryStatusSchema }).strict(),
	z
		.object({ method: z.literal('getLibraryTrackForPath'), result: trackSchema.nullable() })
		.strict(),
	z
		.object({ method: z.literal('validateAudioFile'), result: validateAudioFileResultSchema })
		.strict(),
	z.object({ method: z.literal('listLibraryRoots'), result: z.array(libraryRootSchema) }).strict(),
	z.object({ method: z.literal('registerLibraryRoot'), result: libraryRootSchema }).strict(),
	z.object({ method: z.literal('setLibraryRootEnabled'), result: libraryRootSchema }).strict(),
	z.object({ method: z.literal('removeLibraryRoot'), result: z.null() }).strict(),
	z.object({ method: z.literal('getLibraryScanState'), result: libraryScanSchema }).strict(),
	z.object({ method: z.literal('startLibraryScan'), result: z.null() }).strict(),
	z.object({ method: z.literal('cancelLibraryScan'), result: z.null() }).strict(),
	z.object({ method: z.literal('listLibraryTracks'), result: page(trackSchema) }).strict(),
	z.object({ method: z.literal('listLibraryAlbums'), result: page(albumSchema) }).strict(),
	z.object({ method: z.literal('listLibraryAlbumArtists'), result: page(artistSchema) }).strict(),
	z.object({ method: z.literal('getLibraryAlbumArtist'), result: artistSchema }).strict(),
	z.object({ method: z.literal('listLibraryArtistAlbums'), result: page(albumSchema) }).strict(),
	z
		.object({ method: z.literal('getLibraryAlbumDetails'), result: libraryAlbumDetailsSchema })
		.strict(),
	z
		.object({
			method: z.literal('listLibraryAlbumTracks'),
			result: z
				.object({
					items: z.array(albumTrackSchema),
					totalCount: number,
					nextCursor: nullableString
				})
				.strict()
		})
		.strict(),
	z.object({ method: z.literal('startLibraryTrack'), result: playbackSnapshotSchema }).strict(),
	z.object({ method: z.literal('startLibraryAlbum'), result: playbackSnapshotSchema }).strict()
]);

const backendEventSchema = z.discriminatedUnion('event', [
	z.object({ event: z.literal('ready') }).strict(),
	z.object({ event: z.literal('playbackStateChanged'), payload: playbackSnapshotSchema }).strict(),
	z
		.object({ event: z.literal('playbackQueueStateChanged'), payload: playbackQueueSchema })
		.strict(),
	z
		.object({
			event: z.literal('applicationActivitiesChanged'),
			payload: z.array(
				z
					.object({
						id: z.string(),
						kind: z.literal('librarySync'),
						state: z.enum(['running', 'attentionRequired'])
					})
					.strict()
			)
		})
		.strict(),
	z.object({ event: z.literal('libraryScanStateChanged'), payload: libraryScanSchema }).strict()
]);

const backendResponseMessageSchema = z
	.object({
		type: z.literal('response'),
		payload: z.discriminatedUnion('status', [
			z
				.object({
					status: z.literal('ok'),
					id: z.number().int().nonnegative(),
					response: backendResponseSchema
				})
				.strict(),
			z
				.object({
					status: z.literal('error'),
					id: z.number().int().nonnegative(),
					error: protocolErrorSchema
				})
				.strict()
		])
	})
	.strict();

const backendEventMessageSchema = z
	.object({
		type: z.literal('event'),
		payload: backendEventSchema
	})
	.strict();

export const BackendWireMessageSchema = z.union([
	backendResponseMessageSchema,
	backendEventMessageSchema
]);

export type BackendWireMessage = z.infer<typeof BackendWireMessageSchema>;
export type BackendWireResponse = z.infer<typeof backendResponseMessageSchema>;
export type BackendWireEvent = z.infer<typeof backendEventSchema>;
