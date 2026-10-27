import { QueryClient } from "@tanstack/svelte-query";
import { createContext } from "svelte";
import { prefersReducedMotion } from "svelte/motion";
import { Appearance } from "#lib/appearance/appearance.svelte";
import { Library } from "#lib/library/library.svelte";
import { Lyrics } from "#lib/lyrics/lyrics.svelte";
import * as native from "#lib/native/commands";
import { AudioOutputDevices } from "#lib/player/audio-output-devices.svelte";
import { PlaybackClock } from "#lib/player/playback-clock.svelte";
import { Player } from "#lib/player/player.svelte";
import { Connection } from "./connection.svelte";
import { Notices } from "./notices.svelte";
import { NowPlaying } from "./now-playing.svelte";
import { ScrollOffsets } from "./scroll.svelte";
import { UserActions } from "./user-actions.svelte";

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
 * The window's UI state. It is not Backend state: it lives only in the Renderer, and it spans
 * several Areas, so the App holds it.
 */
class AppUi {
  /** What the user sees as notices, errors, and offers. */
  public readonly notices = new Notices();
  /** Runs user actions and tells which places are busy. */
  public readonly actions = new UserActions(this.notices);
  /** The scroll positions of the workspace, by list path. */
  public readonly scroll = new ScrollOffsets();
  public readonly nowPlaying = new NowPlaying();
  /** Whether the Queue panel is open. */
  public queuePanelOpen = $state(false);
}

/**
 * The Renderer's root. It composes the Areas and holds the UI state of the whole window. A component
 * reads it with `useApp`.
 */
export class App {
  public readonly queryClient: QueryClient;
  public readonly player: Player;
  public readonly library: Library;
  public readonly lyrics: Lyrics;
  public readonly appearance: Appearance;
  public readonly outputDevices: AudioOutputDevices;
  public readonly motion: Motion;
  public readonly ui: AppUi;
  public readonly connection: Connection;

  public constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.player = new Player(native.player, new PlaybackClock());
    this.appearance = new Appearance(native.appearance);
    this.outputDevices = new AudioOutputDevices(native.player);
    this.library = new Library(native.library, queryClient);
    this.lyrics = new Lyrics(native.lyrics, queryClient);
    this.ui = new AppUi();

    const appearance = this.appearance;
    this.motion = {
      get reduced(): boolean {
        return prefersReducedMotion.current;
      },
      get breathing(): boolean {
        return !prefersReducedMotion.current && !appearance.calmMotion;
      },
    };

    this.connection = new Connection(native.app, {
      player: this.player,
      library: this.library,
      lyrics: this.lyrics,
      appearance: this.appearance,
      notices: this.ui.notices,
    });
  }
}
