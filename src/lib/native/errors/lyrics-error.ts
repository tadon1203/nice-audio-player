import type { LyricsCommandError } from "../bindings";
import { NativeCommandError } from "./native-command-error";

/** A lyrics command the Backend rejected. */
export class LyricsError extends NativeCommandError<LyricsCommandError> {
  public constructor(error: LyricsCommandError) {
    super("lyrics", error);
  }
}
