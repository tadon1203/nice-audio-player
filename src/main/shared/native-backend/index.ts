import { createRequire } from "node:module";
import { join } from "node:path";
import { app } from "electron";
import type * as NativeBinding from "./native-backend";

export type NativeBackend = NativeBinding.NativeBackend;
export type {
  LibraryAlbumArtistSortKey,
  LibraryAlbumSortKey,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  LibraryTrackSortKey,
} from "./native-backend";

const nativeRequire = createRequire(import.meta.url);

export function loadNativeBinding(): typeof NativeBinding {
  const root = app.isPackaged ? process.resourcesPath : process.cwd();
  return nativeRequire(join(root, "build", "native", "index.cjs")) as typeof NativeBinding;
}
