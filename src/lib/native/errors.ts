import type { CommandError } from "./bindings";

/** The Backend area a command belongs to. */
export type NativeArea = "player" | "library" | "lyrics" | "meter" | "appearance" | "app";

/** A command the Backend rejected with a `CommandError`. */
export class NativeError extends Error {
  public readonly area: NativeArea;
  /** The error value the Backend rejected with. */
  public readonly error: CommandError;

  public constructor(area: NativeArea, error: CommandError) {
    super(`Native ${area} command failed: ${error.code}`);
    this.name = "NativeError";
    this.area = area;
    this.error = error;
  }

  public get code(): CommandError["code"] {
    return this.error.code;
  }
}

/** The command failed without a `CommandError` (the IPC itself failed). */
export class IpcError extends Error {
  public constructor() {
    super("Native command failed without a reply");
    this.name = "IpcError";
  }
}

/** True for a command a newer one replaced. Nobody reports it. */
export function isSuperseded(error: unknown): boolean {
  return error instanceof NativeError && error.code === "superseded";
}
