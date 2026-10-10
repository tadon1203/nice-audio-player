import type { BackendMessage, InitialState, commands } from "./bindings";

/**
 * The renderer-facing native API. Command signatures come from the generated
 * `bindings.ts`, so Rust stays the single source of truth for the contract.
 */
export type TNativeAPI = Omit<typeof commands, "subscribeMeterFrames" | "connect"> & {
  /** Starts the Meter frames. The adapter makes the channel; `onFrame` gets each raw frame. */
  subscribeMeterFrames: (onFrame: (frame: ArrayBuffer) => void) => Promise<number>;
  selectLibraryDirectory: () => Promise<string | null>;
  /** Registers `onMessage` for every BackendMessage, then returns the current values. */
  connect: (onMessage: (message: BackendMessage) => void) => Promise<InitialState>;
};
