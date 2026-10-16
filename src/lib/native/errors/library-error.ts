import type { LibraryCommandError } from "../bindings";
import { NativeCommandError } from "./native-command-error";

/** A Library command the Backend rejected. */
export class LibraryError extends NativeCommandError<LibraryCommandError> {
  public constructor(error: LibraryCommandError) {
    super("library", error);
  }
}
