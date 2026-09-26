import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { NativeCommandError } from "@/renderer/shared/lib/native-error";
import { commands } from "@/shared/ipc";
import type { AppEvent, TNativeAPI } from "@/shared/ipc";

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

function isAppEvent(payload: unknown): payload is AppEvent {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "event" in payload &&
    typeof payload.event === "string"
  );
}

const tauriApi: TNativeAPI = {
  ...withNativeErrors(commands),
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

type TestWindow = Window & { __TAURI_TEST_API__?: TNativeAPI };

export function nativeApi(): TNativeAPI {
  const api = getNativeApiOrNull();
  if (api === null) throw new NativeBridgeUnavailableError();
  return api;
}

export function getNativeApiOrNull(): TNativeAPI | null {
  if (typeof window === "undefined") return null;
  const testApi = (window as TestWindow).__TAURI_TEST_API__;
  if (testApi !== undefined) return testApi;
  return isTauri() ? tauriApi : null;
}
