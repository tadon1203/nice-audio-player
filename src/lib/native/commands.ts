import type { CommandError } from "./bindings";
import { IpcError, NativeError, type NativeArea } from "./errors";

/** The `CommandError` a rejected command carries, or null when the rejection has none. */
function codedError(reason: unknown): CommandError | null {
  if (typeof reason !== "object" || reason === null || !("code" in reason)) return null;
  return typeof reason.code === "string" ? (reason as CommandError) : null;
}

/**
 * Runs one generated binding call. The Backend's rejection becomes NativeError; a rejection
 * without a code, such as a lost IPC, becomes IpcError. Every area command goes through here.
 */
export async function command<T>(area: NativeArea, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (reason) {
    const error = codedError(reason);
    if (error === null) throw new IpcError();
    throw new NativeError(area, error);
  }
}
