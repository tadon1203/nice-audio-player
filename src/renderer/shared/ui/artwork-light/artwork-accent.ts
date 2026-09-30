import { contrastRatio, worstCaseSurfaceLuminance } from "./light-model";

const MIN_CONTRAST = 4.5;
const STEP = 0.05;

const channelLuminance = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminanceOf = ([r, g, b]: readonly [number, number, number]) =>
  0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (match === null) return null;
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)];
}

const toHex = (rgb: readonly number[]) =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

/**
 * The artwork's representative color, lightened just enough to read as text/ink over even the
 * brightest Light (AA, 4.5:1). Lightening mixes toward white, so the hue is kept. Returns
 * null for input that is not `#rrggbb`.
 */
export function readableAccent(hex: string | null | undefined): string | null {
  const rgb = hex == null ? null : parseHex(hex);
  if (rgb === null) return null;
  const surface = worstCaseSurfaceLuminance();
  for (let mix = 0; mix <= 1; mix += STEP) {
    const mixed = rgb.map((channel) => channel + (255 - channel) * mix) as [number, number, number];
    if (contrastRatio(luminanceOf(mixed), surface) >= MIN_CONTRAST) return toHex(mixed);
  }
  return "#ffffff";
}
