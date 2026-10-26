import { Channel } from "@tauri-apps/api/core";
import { commands, type BackendMessage, type CommandError, type MeterFrame } from "./bindings";
import { IpcError, NativeError, type NativeArea } from "./errors";

/** The `CommandError` a rejected command carries, or null when the rejection has none. */
function codedError(reason: unknown): CommandError | null {
  if (typeof reason !== "object" || reason === null || !("code" in reason)) return null;
  return typeof reason.code === "string" ? (reason as CommandError) : null;
}

/**
 * Runs one generated binding call. The Backend's rejection becomes NativeError; a rejection
 * without a code, such as a lost IPC, becomes IpcError. Every area command goes through here.
 */
export async function command<T>(area: NativeArea, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (reason) {
    const error = codedError(reason);
    if (error === null) throw new IpcError();
    throw new NativeError(area, error);
  }
}

/** One area method: the generated command with the same parameters and result, run through `command`. */
function areaCommand<Args extends unknown[], Result>(
  name: NativeArea,
  run: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return (...args) => command(name, () => run(...args));
}

/** The Playback commands, and the queue they share. */
export const player = {
  play: areaCommand("player", commands.playerPlay),
  pause: areaCommand("player", commands.playerPause),
  resume: areaCommand("player", commands.playerResume),
  previous: areaCommand("player", commands.playerPrevious),
  next: areaCommand("player", commands.playerNext),
  seek: areaCommand("player", commands.playerSeek),
  setVolume: areaCommand("player", commands.playerSetVolume),
  setMuted: areaCommand("player", commands.playerSetMuted),
  setOutputSelection: areaCommand("player", commands.playerSetOutputSelection),
  listOutputDevices: areaCommand("player", commands.playerListOutputDevices),
  setRepeatMode: areaCommand("player", commands.playerSetRepeatMode),
  setShuffle: areaCommand("player", commands.playerSetShuffle),
  removeQueueItem: areaCommand("player", commands.playerRemoveQueueItem),
  moveQueueItem: areaCommand("player", commands.playerMoveQueueItem),
  playQueueItem: areaCommand("player", commands.playerPlayQueueItem),
  enqueueTrack: areaCommand("player", commands.playerEnqueueTrack),
  clearQueue: areaCommand("player", commands.playerClearQueue),
  restorePreviousQueue: areaCommand("player", commands.playerRestorePreviousQueue),
  queueWindow: areaCommand("player", commands.playerQueueWindow),
};

/** The Library commands: the directories, the scan, the catalog lists and their indexes. */
export const library = {
  reset: areaCommand("library", commands.libraryReset),
  addDirectory: areaCommand("library", commands.libraryAddDirectory),
  setDirectoryEnabled: areaCommand("library", commands.librarySetDirectoryEnabled),
  removeDirectory: areaCommand("library", commands.libraryRemoveDirectory),
  deleteMissingTracks: areaCommand("library", commands.libraryDeleteMissingTracks),
  startScan: areaCommand("library", commands.libraryStartScan),
  cancelScan: areaCommand("library", commands.libraryCancelScan),
  listTracks: areaCommand("library", commands.libraryListTracks),
  listAlbums: areaCommand("library", commands.libraryListAlbums),
  listArtists: areaCommand("library", commands.libraryListArtists),
  trackIndex: areaCommand("library", commands.libraryTrackIndex),
  albumIndex: areaCommand("library", commands.libraryAlbumIndex),
  artistIndex: areaCommand("library", commands.libraryArtistIndex),
  artist: areaCommand("library", commands.libraryArtist),
  listArtistAlbums: areaCommand("library", commands.libraryListArtistAlbums),
  album: areaCommand("library", commands.libraryAlbum),
  listAlbumTracks: areaCommand("library", commands.libraryListAlbumTracks),
  trackProperties: areaCommand("library", commands.libraryTrackProperties),
  revealTrack: areaCommand("library", commands.libraryRevealTrack),
  artworkAccent: areaCommand("library", commands.libraryArtworkAccent),
};

/** The lyrics of a track, read from the Backend. */
export const lyrics = {
  track: areaCommand("lyrics", commands.lyricsTrack),
};

/**
 * The Meter frames. `start` takes the callback for each frame, and a new start replaces the one
 * before it. `stop` ends the frames. The Channel that carries the frames is made here, not by the
 * caller.
 */
export const meter = {
  start: (onFrame: (frame: MeterFrame) => void): Promise<void> =>
    command("meter", () => commands.meterStart(new Channel<MeterFrame>(onFrame))),
  stop: (): Promise<void> => command("meter", () => commands.meterStop()),
};

/** The Appearance: the partial update that the Backend saves and returns. */
export const appearance = {
  update: areaCommand("appearance", commands.appearanceUpdate),
};

/** The app-wide commands: the one channel to the Renderer, and the log directory. */
export const app = {
  /** Registers `onMessage`; the latest value of every state arrives on it first. */
  connect: (onMessage: (message: BackendMessage) => void): Promise<void> =>
    command("app", () => commands.appConnect(new Channel<BackendMessage>(onMessage))),
  openLogDirectory: areaCommand("app", commands.appOpenLogDirectory),
};
