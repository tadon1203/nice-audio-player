import { Channel } from "@tauri-apps/api/core";
import { commands, type BackendMessage, type CommandError, type MeterFrame } from "./bindings";
import { CommandFailed } from "./errors";

/** The code a rejected command carries. A rejection without one, such as a lost IPC, is `internal`. */
function codeOf(reason: unknown): CommandError["code"] {
  if (typeof reason !== "object" || reason === null || !("code" in reason)) return "internal";
  return typeof reason.code === "string" ? (reason.code as CommandError["code"]) : "internal";
}

/**
 * Runs one generated binding call. The Backend's rejection becomes a CommandFailed with its code.
 * Every command goes through here.
 */
export async function command<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (reason) {
    throw new CommandFailed(codeOf(reason));
  }
}

/** One command: the generated binding with the same parameters and result, run through `command`. */
function call<Args extends unknown[], Result>(
  run: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return (...args) => command(() => run(...args));
}

/** The Playback commands, and the queue they share. */
export const player = {
  play: call(commands.playerPlay),
  pause: call(commands.playerPause),
  resume: call(commands.playerResume),
  previous: call(commands.playerPrevious),
  next: call(commands.playerNext),
  seek: call(commands.playerSeek),
  setVolume: call(commands.playerSetVolume),
  setMuted: call(commands.playerSetMuted),
  setOutputSelection: call(commands.playerSetOutputSelection),
  listOutputDevices: call(commands.playerListOutputDevices),
  setRepeatMode: call(commands.playerSetRepeatMode),
  setShuffle: call(commands.playerSetShuffle),
  removeQueueItem: call(commands.playerRemoveQueueItem),
  moveQueueItem: call(commands.playerMoveQueueItem),
  playQueueItem: call(commands.playerPlayQueueItem),
  enqueueTrack: call(commands.playerEnqueueTrack),
  clearQueue: call(commands.playerClearQueue),
  restorePreviousQueue: call(commands.playerRestorePreviousQueue),
  queueWindow: call(commands.playerQueueWindow),
};

/** The Library commands: the directories, the scan, the catalog lists and their indexes. */
export const library = {
  reset: call(commands.libraryReset),
  addDirectory: call(commands.libraryAddDirectory),
  setDirectoryEnabled: call(commands.librarySetDirectoryEnabled),
  removeDirectory: call(commands.libraryRemoveDirectory),
  deleteMissingTracks: call(commands.libraryDeleteMissingTracks),
  startScan: call(commands.libraryStartScan),
  cancelScan: call(commands.libraryCancelScan),
  listTracks: call(commands.libraryListTracks),
  listAlbums: call(commands.libraryListAlbums),
  listArtists: call(commands.libraryListArtists),
  trackIndex: call(commands.libraryTrackIndex),
  albumIndex: call(commands.libraryAlbumIndex),
  artistIndex: call(commands.libraryArtistIndex),
  artist: call(commands.libraryArtist),
  listArtistAlbums: call(commands.libraryListArtistAlbums),
  album: call(commands.libraryAlbum),
  listAlbumTracks: call(commands.libraryListAlbumTracks),
  trackProperties: call(commands.libraryTrackProperties),
  revealTrack: call(commands.libraryRevealTrack),
  artworkAccent: call(commands.libraryArtworkAccent),
};

/** The lyrics of a track, read from the Backend. */
export const lyrics = {
  track: call(commands.lyricsTrack),
};

/**
 * The Meter frames. `start` takes the callback for each frame, and a new start replaces the one
 * before it. `stop` ends the frames. The Channel that carries the frames is made here, not by the
 * caller.
 */
export const meter = {
  start: (onFrame: (frame: MeterFrame) => void): Promise<void> =>
    command(() => commands.meterStart(new Channel<MeterFrame>(onFrame))),
  stop: (): Promise<void> => command(() => commands.meterStop()),
};

/** The Appearance: the partial update that the Backend saves and returns. */
export const appearance = {
  update: call(commands.appearanceUpdate),
};

/** The app-wide commands: the one channel to the Renderer, and the log directory. */
export const app = {
  /** Registers `onMessage`; the latest value of every state arrives on it first. */
  connect: (onMessage: (message: BackendMessage) => void): Promise<void> =>
    command(() => commands.appConnect(new Channel<BackendMessage>(onMessage))),
  openLogDirectory: call(commands.appOpenLogDirectory),
};
