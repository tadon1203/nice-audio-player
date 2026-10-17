import { describe, expect, it } from "vitest";
import { params } from "./index";

// The same vectors as `a_command_argument_with_a_bad_album_id_is_rejected_at_deserialization`
// in `backend/src/ids.rs`: the route matcher and the Rust parser must accept the same text.
const good = ["ab".repeat(16), "0123456789abcdef".repeat(2)];
const bad = ["ab".repeat(15), "ab".repeat(17), "AB".repeat(16), `${"a".repeat(31)}g`, ""];

describe.each(["albumId", "artistId"] as const)("%s param", (name) => {
  it.each(good)("accepts %s", async (value) => {
    expect(await params[name]["~standard"].validate(value)).toEqual({ value });
  });

  it.each(bad)("rejects %j", async (value) => {
    expect(await params[name]["~standard"].validate(value)).toHaveProperty("issues");
  });
});
