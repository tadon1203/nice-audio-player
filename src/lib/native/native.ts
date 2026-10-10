import { Channel, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { commands } from "./bindings";
import type { AppEvent } from "./bindings";
import type { TNativeAPI } from "./native-api";
import { NativeCommandError } from "./native-error";

export class NativeBridgeUnavailableError extends Error {
  readonly code = "nativeBridgeUnavailable";

  constructor() {
    super("Native application bridge is unavailable");
    this.name = "NativeBridgeUnavailableError";
  }
}

/** Backend commands reject with a structured `{ code }` object. */
function toNativeError(error: unknown): NativeCommandError {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    if (typeof code === "string")
      return new NativeCommandError(code, `Native command failed: ${code}`);
  }
  return new NativeCommandError("ipcError", "Native command failed");
}

type Commands = typeof commands;

function withNativeErrors(source: Commands): Commands {
  const wrapped = Object.fromEntries(
    Object.entries(source).map(([name, command]) => [
      name,
      async (...args: unknown[]) => {
        try {
          return await (command as (...values: unknown[]) => Promise<unknown>)(...args);
        } catch (error) {
          throw toNativeError(error);
        }
      },
    ]),
  );
  return wrapped as Commands;
}

/**
 * Every event name the backend can send. Typed against the generated union, so an event added
 * in Rust is a compile error here until the renderer knows it; payloads are trusted to match
 * the generated contract.
 */
const appEventNames: Readonly<Record<AppEvent["event"], true>> = {
  playbackStateChanged: true,
  playbackPositionChanged: true,
  playbackQueueStateChanged: true,
  libraryScanStateChanged: true,
  waveformChanged: true,
  settingsChanged: true,
};

function isAppEvent(payload: unknown): payload is AppEvent {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "event" in payload &&
    typeof payload.event === "string" &&
    Object.hasOwn(appEventNames, payload.event) &&
    "payload" in payload
  );
}

const nativeCommands = withNativeErrors(commands);

const tauriApi: TNativeAPI = {
  ...nativeCommands,
  subscribeMeterFrames: (onFrame) =>
    nativeCommands.subscribeMeterFrames(new Channel<ArrayBuffer>(onFrame)),
  selectLibraryDirectory: async () => {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  },
  onEvent: (listener) => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<unknown>("app:event", ({ payload }) => {
      if (isAppEvent(payload)) listener(payload);
    }).then((stopListening) => {
      if (cancelled) stopListening();
      else unlisten = stopListening;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  },
};

/** The window chrome the renderer draws itself (the window has no native decorations). */
export type NativeWindow = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  /** Calls `listener` with the current state now and whenever it changes. */
  onMaximizedChange: (listener: (maximized: boolean) => void) => () => void;
};

const tauriWindow: NativeWindow = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  onMaximizedChange: (listener) => {
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const sync = () =>
      void appWindow.isMaximized().then((value) => {
        if (!disposed) listener(value);
      });
    sync();
    void appWindow.onResized(sync).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  },
};

function resolveNative(): TNativeAPI | null {
  if (typeof window === "undefined") return null;
  return isTauri() ? tauriApi : null;
}

/**
 * The one way into the backend, resolved once when the renderer loads: the adapter when the
 * native bridge exists, `null` otherwise (a plain browser). The shell shows the "no bridge"
 * state in one place; code that only runs after that (queries, commands) uses `requireNative`.
 */
export const native: TNativeAPI | null = resolveNative();

/** Window controls; `null` unless running inside the desktop app. */
export const nativeWindow: NativeWindow | null =
  typeof window !== "undefined" && isTauri() ? tauriWindow : null;

export function requireNative(): TNativeAPI {
  if (native === null) throw new NativeBridgeUnavailableError();
  return native;
}
