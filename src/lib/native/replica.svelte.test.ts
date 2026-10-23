import { describe, expect, it } from "vitest";
import type { Revisioned } from "./bindings";
import { Replica } from "./replica.svelte";

const versioned = (revision: number, value: string): Revisioned<string> => ({ revision, value });

describe("Replica", () => {
  it("knows nothing until the first value is accepted, and keeps the first value", () => {
    const replica = new Replica<string>();
    expect(replica.value).toBeNull();
    expect(replica.revision).toBeNull();
    expect(replica.accept(versioned(1, "first"))).toBe(true);
    expect(replica.value).toBe("first");
    expect(replica.revision).toBe(1);
  });

  it("drops a stale value and keeps the held one", () => {
    const replica = new Replica<string>();
    replica.accept(versioned(2, "newer"));
    expect(replica.accept(versioned(1, "older"))).toBe(false);
    expect(replica.value).toBe("newer");
    expect(replica.revision).toBe(2);
  });

  it("drops a value with the same revision as the one it holds", () => {
    const replica = new Replica<string>();
    replica.accept(versioned(3, "held"));
    expect(replica.accept(versioned(3, "again"))).toBe(false);
    expect(replica.value).toBe("held");
  });

  it("replaces the held value with a newer revision", () => {
    const replica = new Replica<string>();
    replica.accept(versioned(1, "old"));
    expect(replica.accept(versioned(4, "new"))).toBe(true);
    expect(replica.value).toBe("new");
    expect(replica.revision).toBe(4);
  });

  it("orders a command response and a pushed message through the same accept", () => {
    const replica = new Replica<string>();
    // A pushed message arrives first, then the response to a command sent earlier.
    replica.accept(versioned(5, "pushed"));
    expect(replica.accept(versioned(4, "response"))).toBe(false);
    expect(replica.value).toBe("pushed");
    // A response to a later command wins over an earlier push.
    expect(replica.accept(versioned(6, "response"))).toBe(true);
    expect(replica.value).toBe("response");
  });
});
