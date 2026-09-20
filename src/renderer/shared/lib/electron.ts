import type { TElectronAPI } from "@/shared/ipc";

export class NativeBridgeUnavailableError extends Error {
  readonly code = "nativeBridgeUnavailable";

  constructor() {
    super("Native application bridge is unavailable");
    this.name = "NativeBridgeUnavailableError";
  }
}

export function electronApi(): TElectronAPI {
  const api = getElectronApiOrNull();
  if (api === null) throw new NativeBridgeUnavailableError();
  return api;
}

/** Returns the isolated Preload API without inventing a browser fallback. */
export function getElectronApiOrNull(): TElectronAPI | null {
  return typeof window === "undefined" ? null : (window.electron ?? null);
}
