import { defineParams } from "@sveltejs/kit/params";

/** The param matchers of the routes, by the name a route gives them (`[artistId=artistId]`). */
export const params = defineParams({
  // An Album Artist ID: 32 lowercase hex characters (see `ids.rs`).
  artistId: (param) => (/^[0-9a-f]{32}$/.test(param) ? param : undefined),
});
