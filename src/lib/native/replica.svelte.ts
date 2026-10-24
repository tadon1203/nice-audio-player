import type { Versioned } from "./bindings";

/** The Renderer's copy of one Backend state topic. Keeps only newer versions. */
export class Replica<T> {
  #current = $state.raw<Versioned<T> | null>(null);

  public get value(): T | null {
    return this.#current?.value ?? null;
  }

  public get version(): number | null {
    return this.#current?.version ?? null;
  }

  /** Keeps `incoming` if it is newer than the current value. Returns true if it kept it. */
  public accept(incoming: Versioned<T>): boolean {
    // The first value is always kept; after it, only a newer version replaces the held one.
    if (this.version !== null && incoming.version <= this.version) return false;
    this.#current = incoming;
    return true;
  }
}
