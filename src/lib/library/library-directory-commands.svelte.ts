import type { library } from "#lib/native/commands";
import { selectDirectory } from "#lib/native/desktop";

/**
 * The Library's directory and scan commands. Each awaits the command. The Library state that
 * follows it arrives by push, so nothing is refreshed here.
 */
export class LibraryDirectoryCommands {
  readonly #library: typeof library;

  public constructor(libraryCommands: typeof library) {
    this.#library = libraryCommands;
  }

  /** Does nothing when the user closes the directory dialog. */
  public async add(): Promise<void> {
    const path = await selectDirectory();
    if (path === null) return;
    await this.#library.addDirectory(path);
  }

  public async setEnabled(id: number, enabled: boolean): Promise<void> {
    await this.#library.setDirectoryEnabled(id, enabled);
  }

  public async remove(id: number): Promise<void> {
    await this.#library.removeDirectory(id);
  }

  /** Removes the Missing tracks from the Library (never a source file). */
  public async deleteMissing(): Promise<void> {
    await this.#library.deleteMissingTracks();
  }

  public async startScan(): Promise<void> {
    await this.#library.startScan();
  }

  public async cancelScan(): Promise<void> {
    await this.#library.cancelScan();
  }

  /** The Backend restarts the app on success. */
  public async resetAndRescan(): Promise<void> {
    await this.#library.reset();
  }
}
