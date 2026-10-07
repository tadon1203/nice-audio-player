import type { AppEvent, commands } from "./bindings";

/**
 * The renderer-facing native API. Command signatures come from the generated
 * `bindings.ts`, so Rust stays the single source of truth for the contract.
 */
export type TNativeAPI = Omit<typeof commands, "subscribeMeterFrames"> & {
  /** Starts the Meter frames. The adapter makes the channel; `onFrame` gets each raw frame. */
  subscribeMeterFrames: (onFrame: (frame: ArrayBuffer) => void) => Promise<number>;
  selectLibraryDirectory: () => Promise<string | null>;
  onEvent: (listener: (event: AppEvent) => void) => () => void;
};
