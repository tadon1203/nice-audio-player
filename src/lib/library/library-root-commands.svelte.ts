import type { LibraryClient, LibraryRoot } from "#lib/native";
import type { CatalogRepository } from "./catalog-repository";

/**
 * The Library's folder and scan commands. Each awaits the client, then refreshes the catalog where
 * the change alters what the catalog lists.
 */
export class LibraryRootCommands {
  readonly #client: LibraryClient;
  readonly #catalog: CatalogRepository;

  public constructor(client: LibraryClient, catalog: CatalogRepository) {
    this.#client = client;
    this.#catalog = catalog;
  }

  /** Resolves null when the user closes the folder dialog. */
  public async add(): Promise<LibraryRoot | null> {
    const path = await this.#client.selectDirectory();
    if (path === null) return null;
    const root = await this.#client.registerRoot(path);
    this.#catalog.refresh();
    return root;
  }

  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.#client.setRootEnabled(id, enabled);
    this.#catalog.refresh();
  }

  public async remove(id: string): Promise<void> {
    await this.#client.removeRoot(id);
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

  public openLogDirectory(): Promise<void> {
    return this.#client.openLogDirectory();
  }
}
