import type { CommandError } from "./bindings";

/**
 * The outcome of one Backend call. A call that the Backend rejects gives `ok: false`; it never
 * throws, so the Renderer checks `ok` where it needs the value or the error.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: CommandError };
