import { useLibraryFocusRestore, useLibraryWorkspace } from "./LibraryWorkspace";
import { AlbumArtistDetailSurface, AlbumDetailSurface } from "./LibraryDetailSurfaces";
import { LibraryRootView } from "./LibraryRootView";
import type { LibraryViewProps } from "./library-view-types";

export type { LibraryViewProps } from "./library-view-types";

export function LibraryView(props: LibraryViewProps) {
  const { presentation, currentFrame, back, selectPresentation } = useLibraryWorkspace();
  useLibraryFocusRestore();
  return (
    <div className="h-full min-h-0 overflow-x-clip">
      {currentFrame?.kind === "album" ? (
        <AlbumDetailSurface {...props} frame={currentFrame} onBack={back} />
      ) : currentFrame?.kind === "albumArtist" ? (
        <AlbumArtistDetailSurface {...props} frame={currentFrame} onBack={back} />
      ) : (
        <LibraryRootView
          {...props}
          presentation={presentation}
          onChangePresentation={selectPresentation}
        />
      )}
    </div>
  );
}
