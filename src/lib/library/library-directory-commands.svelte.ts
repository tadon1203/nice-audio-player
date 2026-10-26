import type { library } from "#lib/native/commands";
import { selectDirectory } from "#lib/native/desktop";
import type { Result } from "#lib/native/result";

/**
 * The Library's directory and scan commands. Each returns the command's Result. The Library state
 * that follows it arrives by push, so nothing is refreshed here.
 */
export class LibraryDirectoryCommands {
  readonly #library: typeof library;

  public constructor(libraryCommands: typeof library) {
    this.#library = libraryCommands;
  }

  /** Does nothing when the user closes the directory dialog. */
  public async add(): Promise<Result<null> | void> {
    const path = await selectDirectory();
    if (path === null) return;
    return this.#library.addDirectory(path);
  }

  public setEnabled(id: number, enabled: boolean): Promise<Result<null>> {
    return this.#library.setDirectoryEnabled(id, enabled);
  }

  public remove(id: number): Promise<Result<null>> {
    return this.#library.removeDirectory(id);
  }

  /** Removes the Missing tracks from the Library (never a source file). */
  public deleteMissing(): Promise<Result<null>> {
    return this.#library.deleteMissingTracks();
  }

  public startScan(): Promise<Result<null>> {
    return this.#library.startScan();
  }

  public cancelScan(): Promise<Result<null>> {
    return this.#library.cancelScan();
  }

  /** The Backend restarts the app on success. */
  public resetAndRescan(): Promise<Result<null>> {
    return this.#library.reset();
  }
}
