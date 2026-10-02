import { deflateSync } from "node:zlib";
import { testLibrary } from "./fixtures/data";
import { motionMs } from "./fixtures/motion";
import { expect, test } from "./fixtures/test";

/** Time for the cover to decode and draw once Now Playing is open, besides its motion. */
const IMAGE_DECODE_MS = 2000;

test.use({ reducedMotion: "no-preference" });

function png(size: number): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 255) / size;
      raw[o + 1] = (y * 255) / size;
      raw[o + 2] = (Math.sin(x / 17) * 127 + 128) | 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const lyrics = {
  status: "resolved",
  trackId: "track-1",
  notice: null,
  document: {
    source: "sidecar",
    language: null,
    content: {
      kind: "timed",
      lines: Array.from({ length: 60 }, (_, index) => ({
        startMs: index * 3_000,
        text: `This is lyric line number ${index + 1} of the song`,
      })),
    },
  },
} as const;

// Guards the cost of Now Playing while a track plays (full motion, Light breathing, waveform,
// lyrics). The seek bar writes progress to two elements instead of an inherited custom property,
// which restyled every bar each frame: broken ~76% of the main thread in style recalculation,
// healthy ~1%. Style time is CPU time, so it holds up under a loaded machine. The breathing
// Light's own compositor layer (`will-change`) has no such seam; it was found with the same
// measurement as raster CPU and frame rate, which are too machine-dependent to assert.
test.use({ reducedMotion: "no-preference" });

test.use({ library: testLibrary({ artwork: true }) });

test("Now Playing stays cheap while a track plays", async ({ page, native, player }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route("http://nice-artwork.localhost/**", (route) =>
    route.fulfill({ contentType: "image/png", body: png(600) }),
  );
  await page.goto("/library/tracks");
  native.respond("getTrackLyrics", lyrics);
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await dock.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await player.publishWaveform();
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await page.getByRole("region", { name: "Now Playing" }).waitFor();
  await page.waitForTimeout(motionMs("large") + IMAGE_DECODE_MS);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const read = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
  };
  const before = await read();
  await page.waitForTimeout(4000);
  const after = await read();
  const share = (name: string) => (((after[name] ?? 0) - (before[name] ?? 0)) / 4) * 100;

  expect(share("RecalcStyleDuration")).toBeLessThan(15);
});
