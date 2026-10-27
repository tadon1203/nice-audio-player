import { QueryClient } from "@tanstack/svelte-query";
import { createContext } from "svelte";
import { prefersReducedMotion } from "svelte/motion";
import { AlbumRepository } from "#lib/library/album-repository";
import { ArtistRepository } from "#lib/library/artist-repository";
import { CatalogRepository } from "#lib/library/catalog-repository";
import { LibraryDirectoryCommands } from "#lib/library/library-directory-commands.svelte";
import { LibraryTrackCommands } from "#lib/library/library-track-commands";
import { LibraryViews } from "#lib/library/library-views.svelte";
import { LyricsRepository } from "#lib/lyrics/lyrics-repository";
import * as native from "#lib/native/commands";
import { AudioOutputDevices } from "#lib/player/audio-output-devices.svelte";
import { PlaybackClock } from "#lib/player/playback-clock.svelte";
import { Player } from "#lib/player/player.svelte";
import { Appearance } from "#lib/appearance/appearance.svelte";
import { Connection } from "./connection.svelte";
import { LibraryStateReplica } from "./library-state-replica.svelte";
import { NowPlaying } from "./now-playing.svelte";
import { ScrollOffsets } from "./scroll.svelte";
import { Notices, UserActions } from "./user-actions.svelte";

const [getApp, setAppContext] = createContext<App>();

/** Registers `app` for the components below the caller. Call during component initialization. */
export function setApp(app: App): App {
  return setAppContext(app);
}

/** The App that the nearest `setApp` registered. Call during component initialization. */
export function useApp(): App {
  return getApp();
}

/** The motion that the system setting and the Appearance allow together. */
export interface Motion {
  /** The system asks for less motion; every movement is a crossfade. */
  readonly reduced: boolean;
  /** The idle motion runs, such as the Artwork glow breathing. Off when calm or reduced. */
  readonly breathing: boolean;
}

/**
 * The Renderer's root. It composes the areas and holds the state of the whole window: the
 * Queue panel, the Now Playing layer, and the motion rule. A component reads it with `useApp`.
 */
export class App {
  public readonly queryClient: QueryClient;
  public readonly player: Player;
  public readonly library: {
    readonly catalog: CatalogRepository;
    readonly albums: AlbumRepository;
    readonly artists: ArtistRepository;
    readonly directories: LibraryDirectoryCommands;
    readonly tracks: LibraryTrackCommands;
    readonly views: LibraryViews;
    readonly state: LibraryStateReplica;
  };
  public readonly lyrics: LyricsRepository;
  public readonly appearance: Appearance;
  public readonly outputDevices: AudioOutputDevices;
  public readonly motion: Motion;
  public readonly nowPlaying: NowPlaying;
  public readonly connection: Connection;
  public readonly actions: UserActions;
  public readonly notices: Notices;
  public readonly scroll: ScrollOffsets;
  /** Whether the Queue panel is open. */
  public queuePanelOpen = $state(false);

  public constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.player = new Player(native.player, new PlaybackClock());
    this.appearance = new Appearance(native.appearance);
    this.outputDevices = new AudioOutputDevices(native.player);

    const appearance = this.appearance;
    this.motion = {
      get reduced(): boolean {
        return prefersReducedMotion.current;
      },
      get breathing(): boolean {
        return !prefersReducedMotion.current && !appearance.calmMotion;
      },
    };

    const catalog = new CatalogRepository(native.library, queryClient);
    const lyrics = new LyricsRepository(native.lyrics, queryClient);
    this.lyrics = lyrics;
    this.library = {
      catalog,
      albums: new AlbumRepository(native.library, queryClient),
      artists: new ArtistRepository(native.library),
      directories: new LibraryDirectoryCommands(native.library),
      tracks: new LibraryTrackCommands(native.library),
      views: new LibraryViews(),
      state: new LibraryStateReplica(() => {
        catalog.refresh();
        lyrics.refresh();
      }),
    };

    this.nowPlaying = new NowPlaying();
    this.notices = new Notices();
    this.actions = new UserActions(this.notices);
    this.scroll = new ScrollOffsets();
    this.connection = new Connection(native.app, this);
  }
}
