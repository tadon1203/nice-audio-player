/**
 * The backend names an album or artist without a tag as "" (and sorts it last); how that reads
 * is decided here.
 */

export const UNKNOWN_ALBUM = "Unknown album";
export const UNKNOWN_ARTIST = "Unknown artist";

export const albumTitleLabel = (title: string) => title || UNKNOWN_ALBUM;
export const artistNameLabel = (name: string) => name || UNKNOWN_ARTIST;
