import { QueryClient } from "@tanstack/svelte-query";
import { createContext } from "svelte";
import { LibraryScanState } from "#lib/library/library-scan-state.svelte";
import { NativeBridgeUnavailableError, type NativeClients } from "#lib/native";
import { TauriNative } from "#lib/native/tauri-native";
import { AudioOutputDevices } from "#lib/playback/audio-output-devices.svelte";
import { PlaybackClock } from "#lib/playback/playback-clock.svelte";
import { Playback } from "#lib/playback/playback.svelte";
import { WaveformRepository } from "#lib/playback/waveform-repository.svelte";
import { Appearance } from "#lib/settings/appearance.svelte";
import { createScanWatcher } from "./scan-finished";
import { MotionBudget } from "./motion-budget.svelte";
import { NativeSession, type SessionTargets } from "./native-session.svelte";
import { NoticeCenter } from "./notice-center.svelte";
import { UserActionRunner } from "./user-action-runner";

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
  /** The library scan state; the library context still provides it to the library pages. */
  public readonly libraryScan = new LibraryScanState();
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

  public constructor(native: NativeClients, queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.actions = new UserActionRunner(this.notices);
    this.playback = new Playback(native.playback, new PlaybackClock());
    this.appearance = new Appearance(native.appearance);
    this.outputDevices = new AudioOutputDevices(native.playback);
    this.waveforms = new WaveformRepository(native.playback);
    this.motion = new MotionBudget(this.appearance);

    const watchScan = createScanWatcher(queryClient, this.libraryScan);
    const targets: SessionTargets = {
      playback: this.playback,
      appearance: this.appearance,
      scan: { accept: ({ value }) => watchScan(value) },
      waveforms: this.waveforms,
      notices: this.notices,
    };
    this.session = new NativeSession(native.session, targets);
  }
}
