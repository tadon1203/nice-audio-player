import type { LibraryClient, LibraryDirectory } from "#lib/native";
import type { CatalogRepository } from "./catalog-repository";

/**
 * The Library's directory and scan commands. Each awaits the client, then refreshes the catalog where
 * the change alters what the catalog lists.
 */
export class LibraryDirectoryCommands {
  readonly #client: LibraryClient;
  readonly #catalog: CatalogRepository;

  public constructor(client: LibraryClient, catalog: CatalogRepository) {
    this.#client = client;
    this.#catalog = catalog;
  }

  /** Resolves null when the user closes the directory dialog. */
  public async add(): Promise<LibraryDirectory | null> {
    const path = await this.#client.selectDirectory();
    if (path === null) return null;
    const directory = await this.#client.registerDirectory(path);
    this.#catalog.refresh();
    return directory;
  }

  public async setEnabled(id: number, enabled: boolean): Promise<void> {
    await this.#client.setDirectoryEnabled(id, enabled);
    this.#catalog.refresh();
  }

  public async remove(id: number): Promise<void> {
    await this.#client.removeDirectory(id);
    this.#catalog.refresh();
  }

  /** Removes the Missing tracks from the Library (never a source file); resolves to how many. */
  public async deleteMissing(): Promise<number> {
    const count = await this.#client.deleteMissing();
    this.#catalog.refresh();
    return count;
  }

  public startScan(): Promise<void> {
    return this.#client.startScan();
  }

  public cancelScan(): Promise<void> {
    return this.#client.cancelScan();
  }

  /** The Backend restarts the app on success. */
  public resetAndRescan(): Promise<void> {
    return this.#client.resetAndRescan();
  }

  public appOpenLogDirectory(): Promise<void> {
    return this.#client.appOpenLogDirectory();
  }
}
