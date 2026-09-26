import type { AppEvent, commands } from "./bindings";

/**
 * The renderer-facing native API. Command signatures come from the generated
 * `bindings.ts`, so Rust stays the single source of truth for the contract.
 */
export type TNativeAPI = typeof commands & {
  selectLibraryDirectory: () => Promise<string | null>;
  onEvent: (listener: (event: AppEvent) => void) => () => void;
};
