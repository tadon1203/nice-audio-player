export type BrowserFixtureName =
  | "empty"
  | "japanese-filename"
  | "long-filename"
  | "unbroken-filename"
  | "long-device"
  | "playing"
  | "volume-low"
  | "volume-zero"
  | "volume-muted"
  | "seek-pending"
  | "failed"
  | "album-detail-wide"
  | "library-browse"
  | "library-empty"
  | "queue-open";

const fixtures = new Set<BrowserFixtureName>([
  "empty",
  "japanese-filename",
  "long-filename",
  "unbroken-filename",
  "long-device",
  "playing",
  "volume-low",
  "volume-zero",
  "volume-muted",
  "seek-pending",
  "failed",
  "album-detail-wide",
  "library-browse",
  "library-empty",
  "queue-open",
]);

export function resolveBrowserFixture(search: string): BrowserFixtureName {
  const requested = new URLSearchParams(search).get("layoutFixture");
  return requested !== null && fixtures.has(requested as BrowserFixtureName)
    ? (requested as BrowserFixtureName)
    : "empty";
}
