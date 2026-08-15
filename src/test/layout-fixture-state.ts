export type LayoutFixtureName =
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
  | "album-detail-wide";

const fixtures = new Set<LayoutFixtureName>([
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
]);

export function resolveLayoutFixture(search: string): LayoutFixtureName {
  const requested = new URLSearchParams(search).get("layoutFixture");
  return requested !== null && fixtures.has(requested as LayoutFixtureName)
    ? (requested as LayoutFixtureName)
    : "empty";
}
