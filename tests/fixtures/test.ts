import { test as base } from "@playwright/test";
import { testLibrary, type LibraryData } from "./data";
import { installNativeApi, type Native } from "./native-api";
import { scriptPlayback } from "./playback-script";

type Fixtures = {
  /** What the Library holds; set with `test.use({ library })`. */
  library: LibraryData;
  /** The fake backend of this test: say what commands answer, emit events, read the calls. */
  native: Native;
  /** Transport answers for playing the whole Library (see `scriptPlayback`). */
  player: ReturnType<typeof scriptPlayback>;
};

export const test = base.extend<Fixtures>({
  library: [testLibrary(), { option: true }],
  native: [
    async ({ page, library }, use) => {
      await use(await installNativeApi(page, { library }));
    },
    { auto: true },
  ],
  player: [
    async ({ native, library }, use) => {
      const player = scriptPlayback(
        native,
        library.tracks.filter((track) => track.playable),
      );
      await use(player);
      player.stopTicks();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
