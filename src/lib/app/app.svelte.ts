import { QueryClient } from "@tanstack/svelte-query";
import { createContext } from "svelte";
import { prefersReducedMotion } from "svelte/motion";
import { Appearance } from "#lib/appearance/appearance.svelte";
import { Library } from "#lib/library/library.svelte";
import { Lyrics } from "#lib/lyrics/lyrics.svelte";
import type * as native from "#lib/native/commands";
import { Player } from "#lib/player/player.svelte";
import { Connection } from "./connection.svelte";
import { type LyricsSpan, NowPlaying } from "./now-playing.svelte";
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

/** The native area objects that the App composes. */
export interface NativeAreas {
  readonly app: typeof native.app;
  readonly appearance: typeof native.appearance;
  readonly library: typeof native.library;
  readonly lyrics: typeof native.lyrics;
  readonly player: typeof native.player;
}

/**
 * The Renderer's root. It composes the Areas and holds the UI state of the whole window. A component
 * reads it with `useApp`. The UI state is not Backend state: it lives only in the Renderer, and it
 * spans several Areas, so the App holds it.
 */
export class App {
  public readonly queryClient: QueryClient;
  public readonly player: Player;
  public readonly library: Library;
  public readonly lyrics: Lyrics;
  public readonly appearance: Appearance;
  public readonly motion: Motion;
  public readonly connection: Connection;
  public readonly notices: Notices;
  /** Runs user actions and tells which places are busy. */
  public readonly actions: UserActions;
  /** The scroll positions of the workspace, by list path. */
  public readonly scroll = new ScrollOffsets();
  public readonly nowPlaying = new NowPlaying();
  /** Whether the Queue panel is open. */
  public queuePanelOpen = $state(false);
  // Each span and position is its own signal: the pointer moves often, and a reader of one of them
  // must not rerun with the others.
  /** The current lyric line's span, lit on the dock waveform. */
  public lyricsActiveSpan = $state.raw<LyricsSpan | null>(null);
  /** The span of the lyric line under the pointer, faintly marked on the waveform. */
  public lyricsHoveredLineSpan = $state.raw<LyricsSpan | null>(null);
  /** The position under the pointer while hovering the waveform, marking its lyric line. */
  public waveformHoveredMs = $state.raw<number | null>(null);

  public constructor(areas: NativeAreas, queryClient: QueryClient, notices: Notices) {
    this.queryClient = queryClient;
    this.notices = notices;
    this.actions = new UserActions(notices);
    this.player = new Player({ player: areas.player, queryClient, notices });
    this.appearance = new Appearance(areas.appearance);
    this.library = new Library(areas.library, queryClient);
    this.lyrics = new Lyrics(areas.lyrics, queryClient);

    const appearance = this.appearance;
    this.motion = {
      get reduced(): boolean {
        return prefersReducedMotion.current;
      },
      get breathing(): boolean {
        return !prefersReducedMotion.current && !appearance.calmMotion;
      },
    };

    this.connection = new Connection(areas.app, {
      player: this.player,
      library: this.library,
      lyrics: this.lyrics,
      appearance: this.appearance,
      notices: this.notices,
    });
  }
}
