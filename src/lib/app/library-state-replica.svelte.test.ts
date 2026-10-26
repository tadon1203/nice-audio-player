import { describe, expect, it, vi } from "vitest";
import { type LibraryState } from "#lib/native/bindings";
import { LibraryStateReplica } from "./library-state-replica.svelte";

function libraryState(version: number, status: "idle" | "running" = "idle"): LibraryState {
  return {
    status: { status: "ready" },
    version,
    directories: [],
    scan: {
      status,
      currentDirectory: null,
      expectedCount: 0,
      progress: null,
      discoveredCount: 0,
      inspectedCount: 0,
      indexedCount: 0,
      failedCount: 0,
      failure: null,
    },
  };
}

/** Each accepted state gets the next topic version, so the replica keeps every one of them. */
let topicVersion = 0;
const pushed = (value: LibraryState): { version: number; value: LibraryState } => ({
  version: ++topicVersion,
  value,
});

function setup(): { replica: LibraryStateReplica; onVersionChange: ReturnType<typeof vi.fn> } {
  const onVersionChange = vi.fn();
  return { replica: new LibraryStateReplica(onVersionChange), onVersionChange };
}

describe("LibraryStateReplica", () => {
  it("holds the pushed state without a change of the Library version", () => {
    const { replica, onVersionChange } = setup();

    replica.accept(pushed(libraryState(0, "running")));

    expect(replica.snapshot?.scan.status).toBe("running");
    expect(onVersionChange).not.toHaveBeenCalled();
  });

  it("runs the change once when the Library version moves", () => {
    const { replica, onVersionChange } = setup();

    replica.accept(pushed(libraryState(0, "running")));
    replica.accept(pushed(libraryState(1)));
    replica.accept(pushed(libraryState(1)));

    expect(onVersionChange).toHaveBeenCalledTimes(1);
  });

  it("never misses a change, even when the states between two versions are dropped", () => {
    const { replica, onVersionChange } = setup();

    replica.accept(pushed(libraryState(1)));
    replica.accept(pushed(libraryState(2)));
    replica.accept(pushed(libraryState(3)));

    expect(onVersionChange).toHaveBeenCalledTimes(3);
  });

  it("ignores a state whose topic version is not newer than the one it holds", () => {
    const { replica, onVersionChange } = setup();
    const newer = pushed(libraryState(1));
    replica.accept(newer);

    replica.accept({ version: newer.version, value: libraryState(2) });

    expect(replica.snapshot?.version).toBe(1);
    expect(onVersionChange).toHaveBeenCalledTimes(1);
  });
});
