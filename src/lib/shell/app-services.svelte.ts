import { QueryClient } from "@tanstack/svelte-query";
import { createContext } from "svelte";
import { AlbumRepository } from "#lib/library/album-repository";
import { ArtistRepository } from "#lib/library/artist-repository";
import { CatalogRepository } from "#lib/library/catalog-repository";
import { LibraryRootCommands } from "#lib/library/library-root-commands.svelte";
import { LibraryTrackCommands } from "#lib/library/library-track-commands";
import { LibraryViews } from "#lib/library/library-views.svelte";
import { LyricsRepository } from "#lib/lyrics/lyrics-repository";
import {
  NativeBridgeUnavailableError,
  TauriNative,
  type MeterClient,
  type NativeClients,
  type WindowClient,
} from "#lib/native";
import { AudioOutputDevices } from "#lib/playback/audio-output-devices.svelte";
import { PlaybackClock } from "#lib/playback/playback-clock.svelte";
import { Playback } from "#lib/playback/playback.svelte";
import { WaveformRepository } from "#lib/playback/waveform-repository.svelte";
import { Appearance } from "#lib/settings/appearance.svelte";
import { MotionBudget } from "./motion-budget.svelte";
import { NativeSession, type SessionTargets } from "./native-session.svelte";
import { NoticeCenter } from "./notice-center.svelte";
import { QueuePanel } from "./queue-panel.svelte";
import { ScanWatcher } from "./scan-watcher.svelte";
import { ScrollMemory } from "./scroll-memory";
import { ShellHistory } from "./shell-history.svelte";
import { LyricsWaveformLink } from "./lyrics-waveform-link.svelte";
import { UserActionRunner } from "./user-action-runner.svelte";

const [getServices, setServices] = createContext<AppServices>();

/**
 * The Renderer's composition root. Only this class constructs services. The root layout creates
 * it once; every component reads it with `current()`.
 */
export class AppServices {
  /**
   * Makes the services from the Tauri clients and registers them in the Context.
   * Returns null when the native bridge is unavailable. Call during component initialization.
   */
  public static tryCreate(): AppServices | null {
    let native: NativeClients;
    try {
      native = TauriNative.clients();
    } catch (error) {
      if (error instanceof NativeBridgeUnavailableError) return null;
      throw error;
    }
    const services = new AppServices(
      native,
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    );
    setServices(services);
    return services;
  }

  /** The services that the root layout registered. Call during component initialization. */
  public static current(): AppServices {
    return getServices();
  }

  public readonly queryClient: QueryClient;
  /** Failures and short messages that the screens show. */
  public readonly notices = new NoticeCenter();
  /** Runs the user actions; each failure goes to `notices`. */
  public readonly actions: UserActionRunner;
  public readonly session: NativeSession;
  public readonly playback: Playback;
  public readonly appearance: Appearance;
  public readonly outputDevices: AudioOutputDevices;
  public readonly waveforms: WaveformRepository;
  public readonly motion: MotionBudget;
  /** The Library's catalog lists and scroll indexes. */
  public readonly catalog: CatalogRepository;
  public readonly albums: AlbumRepository;
  public readonly artists: ArtistRepository;
  public readonly libraryRoots: LibraryRootCommands;
  public readonly libraryTracks: LibraryTrackCommands;
  public readonly libraryViews = new LibraryViews();
  /** The Library scan, as the Backend last reported it. */
  public readonly scan: ScanWatcher;
  public readonly lyrics: LyricsRepository;
  /** The Meter frames from the Backend; the Meters view subscribes through it. */
  public readonly meter: MeterClient;
  /** The window chrome, which the renderer draws itself. */
  public readonly window: WindowClient;
  public readonly history = new ShellHistory();
  public readonly queuePanel = new QueuePanel();
  public readonly scrollMemory = new ScrollMemory();
  public readonly lyricsWaveformLink = new LyricsWaveformLink();

  public constructor(native: NativeClients, queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.actions = new UserActionRunner(this.notices);
    this.playback = new Playback(native.playback, new PlaybackClock());
    this.appearance = new Appearance(native.appearance);
    this.outputDevices = new AudioOutputDevices(native.playback);
    this.waveforms = new WaveformRepository(native.playback);
    this.motion = new MotionBudget(this.appearance);

    this.catalog = new CatalogRepository(native.library, queryClient);
    this.albums = new AlbumRepository(native.library, queryClient);
    this.artists = new ArtistRepository(native.library);
    this.libraryRoots = new LibraryRootCommands(native.library, this.catalog);
    this.libraryTracks = new LibraryTrackCommands(native.library);
    this.lyrics = new LyricsRepository(native.lyrics, queryClient);
    this.scan = new ScanWatcher(this.catalog, this.lyrics);
    this.meter = native.meter;
    this.window = native.window;

    const targets: SessionTargets = {
      playback: this.playback,
      appearance: this.appearance,
      scan: this.scan,
      waveforms: this.waveforms,
      notices: this.notices,
    };
    this.session = new NativeSession(native.session, targets);
  }
}
