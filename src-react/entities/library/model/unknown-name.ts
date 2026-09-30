/**
 * The backend names an album or artist without a tag as "" (and sorts it last); how that reads,
 * and how it fits in a URL, is decided here.
 */

export const UNKNOWN_ALBUM = "Unknown album";
export const UNKNOWN_ARTIST = "Unknown artist";

export const albumTitleLabel = (title: string) => title || UNKNOWN_ALBUM;
export const artistNameLabel = (name: string) => name || UNKNOWN_ARTIST;

/** "" cannot be a path segment, so it travels as "~"; a real name that starts with "~" gets one more. */
export const toNameSegment = (name: string) =>
  name === "" ? "~" : name.startsWith("~") ? `~${name}` : name;

export const fromNameSegment = (segment: string) =>
  segment === "~" ? "" : segment.startsWith("~") ? segment.slice(1) : segment;
