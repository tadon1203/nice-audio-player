import type { library } from "#lib/native/commands";
import { type LibraryDirectory } from "#lib/native/bindings";
import { selectDirectory } from "#lib/native/desktop";
import type { CatalogRepository } from "./catalog-repository";

/**
 * The Library's directory and scan commands. Each awaits the command, then refreshes the catalog where
 * the change alters what the catalog lists.
 */
export class LibraryDirectoryCommands {
  readonly #library: typeof library;
  readonly #catalog: CatalogRepository;

  public constructor(libraryCommands: typeof library, catalog: CatalogRepository) {
    this.#library = libraryCommands;
    this.#catalog = catalog;
  }

  /** Resolves null when the user closes the directory dialog. */
  public async add(): Promise<LibraryDirectory | null> {
    const path = await selectDirectory();
    if (path === null) return null;
    const directory = await this.#library.addDirectory(path);
    this.#catalog.refresh();
    return directory;
  }

  public async setEnabled(id: number, enabled: boolean): Promise<void> {
    await this.#library.setDirectoryEnabled(id, enabled);
    this.#catalog.refresh();
  }

  public async remove(id: number): Promise<void> {
    await this.#library.removeDirectory(id);
    this.#catalog.refresh();
  }

  /** Removes the Missing tracks from the Library (never a source file); resolves to how many. */
  public async deleteMissing(): Promise<number> {
    const count = await this.#library.deleteMissingTracks();
    this.#catalog.refresh();
    return count;
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
