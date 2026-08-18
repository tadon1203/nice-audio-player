import { listen } from "@tauri-apps/api/event";

import { commands } from "@/bindings";
import type {
  LibraryCommandError,
  ArtworkRef,
  LibraryRoot,
  LibraryScanSnapshot,
  LibraryStatus,
  LibraryTrackPage,
  LibraryTrackSummary,
  LibraryAlbumPage,
  LibraryAlbumDetails,
  LibraryAlbumTrackPage,
  LibraryAlbumTrackSummary,
  PlaybackSnapshot,
  StartLibraryTrackError,
  StartLibraryAlbumError,
} from "@/bindings";

const startLibraryTrackErrorCodes = {
  invalidId: true,
  trackNotFound: true,
  trackUnavailable: true,
  trackNotPlayable: true,
  libraryUnavailable: true,
  persistenceFailed: true,
  decodeFailed: true,
  noOutputDevice: true,
  outputDeviceUnavailable: true,
  outputFailed: true,
  playbackWorkerUnavailable: true,
  taskFailed: true,
} satisfies Record<StartLibraryTrackError["code"], true>;

export async function startLibraryTrack(trackId: string): Promise<PlaybackSnapshot> {
  validateId(trackId);
  return commands.startLibraryTrack(trackId);
}
export async function startLibraryAlbumTrack(
  albumId: string,
  trackId: string,
): Promise<PlaybackSnapshot> {
  validateId(albumId);
  validateId(trackId);
  return commands.startLibraryAlbumTrack(albumId, trackId);
}
const startLibraryAlbumErrorCodes = {
  invalidId: true,
  albumNotFound: true,
  noPlayableTracks: true,
  sourceUnavailable: true,
  libraryUnavailable: true,
  persistenceFailed: true,
  decodeFailed: true,
  noOutputDevice: true,
  outputDeviceUnavailable: true,
  outputFailed: true,
  playbackWorkerUnavailable: true,
  taskFailed: true,
} satisfies Record<StartLibraryAlbumError["code"], true>;
export async function startLibraryAlbum(albumId: string): Promise<PlaybackSnapshot> {
  validateId(albumId);
  return commands.startLibraryAlbum(albumId);
}
export function isStartLibraryAlbumError(value: unknown): value is StartLibraryAlbumError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    Object.prototype.hasOwnProperty.call(startLibraryAlbumErrorCodes, value.code)
  );
}
export function isStartLibraryTrackError(value: unknown): value is StartLibraryTrackError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    Object.prototype.hasOwnProperty.call(startLibraryTrackErrorCodes, value.code)
  );
}

const errorCodes = {
  invalidRoot: true,
  rootNotFound: true,
  rootNotDirectory: true,
  canonicalizationFailed: true,
  duplicateRoot: true,
  overlappingRoot: true,
  scanInProgress: true,
  invalidId: true,
  rootMissing: true,
  scanAlreadyRunning: true,
  noEnabledRoots: true,
  scanNotRunning: true,
  libraryUnavailable: true,
  persistenceFailed: true,
  taskFailed: true,
  albumNotFound: true,
} satisfies Record<LibraryCommandError["code"], true>;

export async function getLibraryStatus(): Promise<LibraryStatus> {
  return readStatus(commands.getLibraryStatus());
}
export async function listLibraryRoots(): Promise<LibraryRoot[]> {
  const value: unknown = await commands.listLibraryRoots();
  if (!Array.isArray(value) || !value.every(isLibraryRoot))
    throw new Error("Invalid library roots payload.");
  return value;
}
export async function registerLibraryRoot(path: string): Promise<LibraryRoot> {
  if (!path.trim()) throw new Error("Library root must not be empty.");
  const value: unknown = await commands.registerLibraryRoot(path);
  if (!isLibraryRoot(value)) throw new Error("Invalid library root payload.");
  return value;
}
export async function setLibraryRootEnabled(id: string, enabled: boolean): Promise<LibraryRoot> {
  validateId(id);
  const value: unknown = await commands.setLibraryRootEnabled(id, enabled);
  if (!isLibraryRoot(value)) throw new Error("Invalid library root payload.");
  return value;
}
export async function startLibraryScan(): Promise<void> {
  await commands.startLibraryScan();
}
export async function cancelLibraryScan(): Promise<void> {
  await commands.cancelLibraryScan();
}
export async function getLibraryScanState(): Promise<LibraryScanSnapshot> {
  const value: unknown = await commands.getLibraryScanState();
  if (!isLibraryScanSnapshot(value)) throw new Error("Invalid library scan payload.");
  return value;
}
export async function listLibraryTracks(
  afterId: string | null = null,
  search: string | null = null,
): Promise<LibraryTrackPage> {
  if (afterId !== null) validateId(afterId);
  const value: unknown = await commands.listLibraryTracks(afterId, search);
  if (!isLibraryTrackPage(value)) throw new Error("Invalid library tracks payload.");
  return value;
}
export async function listLibraryAlbums(
  afterId: string | null = null,
  search: string | null = null,
): Promise<LibraryAlbumPage> {
  if (afterId !== null) validateId(afterId);
  const value: unknown = await commands.listLibraryAlbums(afterId, search);
  if (!isLibraryAlbumPage(value)) throw new Error("Invalid library albums payload.");
  return value;
}
export async function getLibraryAlbumDetails(albumId: string): Promise<LibraryAlbumDetails> {
  validateId(albumId);
  const value: unknown = await commands.getLibraryAlbumDetails(albumId);
  if (!isLibraryAlbumDetails(value)) throw new Error("Invalid library album details payload.");
  return value;
}
export async function listLibraryAlbumTracks(
  albumId: string,
  offset = 0,
): Promise<LibraryAlbumTrackPage> {
  validateId(albumId);
  if (!isNatural(offset))
    throw new Error("Album track offsets must be safe non-negative integers.");
  const value: unknown = await commands.listLibraryAlbumTracks(albumId, offset);
  if (!isLibraryAlbumTrackPage(value)) throw new Error("Invalid library album tracks payload.");
  return value;
}
export async function removeLibraryRoot(id: string): Promise<void> {
  validateId(id);
  await commands.removeLibraryRoot(id);
}
export async function getLibraryTrackForPath(path: string): Promise<LibraryTrackSummary | null> {
  if (!path.trim()) throw new Error("Track path must not be empty.");
  const value: unknown = await commands.getLibraryTrackForPath(path);
  if (value !== null && !isLibraryTrackSummary(value))
    throw new Error("Invalid library track payload.");
  return value;
}
export async function listenToLibraryScanProgress(
  handler: (snapshot: LibraryScanSnapshot) => void,
  invalidPayloadHandler?: () => void,
): Promise<() => void> {
  return listen<unknown>("library-scan-progress", ({ payload }) => {
    if (isLibraryScanSnapshot(payload)) handler(payload);
    else invalidPayloadHandler?.();
  });
}
export function isLibraryCommandError(value: unknown): value is LibraryCommandError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    Object.prototype.hasOwnProperty.call(errorCodes, value.code)
  );
}
export function isArtworkRef(value: unknown): value is ArtworkRef {
  if (
    !isRecord(value) ||
    typeof value.contentHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.contentHash)
  )
    return false;
  if (
    (value.mimeType !== "jpeg" && value.mimeType !== "png") ||
    typeof value.relativePath !== "string"
  )
    return false;
  const parts = value.relativePath.split("/");
  return (
    parts.length === 3 &&
    parts[0] === "artwork" &&
    parts[1] === value.contentHash.slice(0, 2) &&
    parts[2] === `${value.contentHash}.${value.mimeType === "jpeg" ? "jpg" : "png"}` &&
    !value.relativePath.startsWith("/") &&
    !parts.some((part) => part === "." || part === "..")
  );
}
function isLibraryRoot(value: unknown): value is LibraryRoot {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.path === "string" &&
    typeof value.enabled === "boolean" &&
    isNatural(value.scanGeneration) &&
    (value.lastSuccessfulScanAtMs === null || isNatural(value.lastSuccessfulScanAtMs))
  );
}
function isLibraryTrackSummary(value: unknown): value is LibraryTrackSummary {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.title === "string" &&
    (value.artist === null || typeof value.artist === "string") &&
    (value.album === null || typeof value.album === "string") &&
    (value.albumArtist === null || typeof value.albumArtist === "string") &&
    (value.artwork === null || isArtworkRef(value.artwork)) &&
    (value.durationMs === null || isNatural(value.durationMs)) &&
    (value.availability === "available" || value.availability === "missing") &&
    typeof value.playable === "boolean"
  );
}
function isLibraryTrackPage(value: unknown): value is LibraryTrackPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isLibraryTrackSummary) &&
    (value.nextAfterId === null || isId(value.nextAfterId))
  );
}
function isLibraryAlbumPage(value: unknown): value is LibraryAlbumPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        isId(item.id) &&
        typeof item.title === "string" &&
        typeof item.albumArtist === "string" &&
        (item.artwork === null || isArtworkRef(item.artwork)),
    ) &&
    (value.nextAfterId === null || isId(value.nextAfterId))
  );
}
function isLibraryAlbumDetails(value: unknown): value is LibraryAlbumDetails {
  return (
    isRecord(value) &&
    isLibraryAlbumSummary(value.summary) &&
    (value.date === null || typeof value.date === "string") &&
    isNatural(value.trackCount) &&
    (value.durationMs === null || isNatural(value.durationMs)) &&
    (value.firstPlayableTrackId === null || isId(value.firstPlayableTrackId))
  );
}
function isLibraryAlbumSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.title === "string" &&
    typeof value.albumArtist === "string" &&
    (value.artwork === null || isArtworkRef(value.artwork))
  );
}
function isLibraryAlbumTrack(value: unknown): value is LibraryAlbumTrackSummary {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.title === "string" &&
    (value.artist === null || typeof value.artist === "string") &&
    (value.trackNumber === null || isNatural(value.trackNumber)) &&
    (value.discNumber === null || isNatural(value.discNumber)) &&
    (value.durationMs === null || isNatural(value.durationMs)) &&
    (value.availability === "available" || value.availability === "missing") &&
    typeof value.playable === "boolean"
  );
}
function isLibraryAlbumTrackPage(value: unknown): value is LibraryAlbumTrackPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isLibraryAlbumTrack) &&
    (value.nextOffset === null || isNatural(value.nextOffset))
  );
}
function isLibraryScanSnapshot(value: unknown): value is LibraryScanSnapshot {
  return (
    isRecord(value) &&
    ["idle", "running", "completed", "cancelled", "failed"].includes(String(value.state)) &&
    (value.currentRoot === null || isLibraryRoot(value.currentRoot)) &&
    isNatural(value.discoveredCount) &&
    isNatural(value.inspectedCount) &&
    isNatural(value.indexedCount) &&
    isNatural(value.failedCount) &&
    (value.failureCode === null || typeof value.failureCode === "string")
  );
}
async function readStatus(value: Promise<unknown>): Promise<LibraryStatus> {
  const payload = await value;
  if (
    isRecord(payload) &&
    (payload.status === "ready" ||
      (payload.status === "unavailable" &&
        [
          "storageUnavailable",
          "databaseOpenFailed",
          "migrationFailed",
          "schemaTooNew",
          "databaseCorrupt",
        ].includes(String(payload.reason))))
  )
    return payload as LibraryStatus;
  throw new Error("Invalid library status payload.");
}
function validateId(id: string): void {
  if (!isId(id)) throw new Error("Library IDs must be canonical positive decimal strings.");
}
function isId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}
function isNatural(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
