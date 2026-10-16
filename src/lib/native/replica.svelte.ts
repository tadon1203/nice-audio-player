import type { Versioned } from "./bindings";

/** The Renderer's copy of one Backend state topic. Keeps only newer revisions. */
export class Replica<T> {
  #current = $state.raw<Versioned<T> | null>(null);

  get value(): T | null {
    return this.#current?.value ?? null;
  }

  get revision(): number | null {
    return this.#current?.revision ?? null;
  }

  /** Keeps `incoming` if it is newer than the current value. Returns true if it kept it. */
  accept(incoming: Versioned<T>): boolean {
    // The first value is always kept; after it, only a newer revision replaces the held one.
    if (this.revision !== null && incoming.revision <= this.revision) return false;
    this.#current = incoming;
    return true;
  }
}
