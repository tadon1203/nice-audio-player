import type { TElectronAPI } from "./preload";

declare global {
  interface Window {
    readonly electron?: TElectronAPI;
  }
}

export {};
