import type { CommandError } from "./bindings";

/** A command the Backend rejected. `code` is the reason the Renderer shows. */
export class CommandFailed extends Error {
  public readonly code: CommandError["code"];

  public constructor(code: CommandError["code"]) {
    super(`Command failed: ${code}`);
    this.name = "CommandFailed";
    this.code = code;
  }
}
