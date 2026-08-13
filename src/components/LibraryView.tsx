import { useEffect, useRef, useState } from "react";
import type {
  LibraryAlbumSummary,
  LibraryScanSnapshot,
  LibraryStatus,
  LibraryTrackSummary,
} from "@/bindings";
import {
  getLibraryStatus,
  listLibraryAlbums,
  listLibraryRoots,
  listLibraryTracks,
  listenToLibraryScanProgress,
} from "@/api/library";
import { resolveArtworkUrl } from "@/lib/artwork-url";

interface LibraryViewProps {
  onOpenSettings: () => void;
  onPlayTrack: (id: string) => void;
  playbackAvailable: boolean;
}

function Artwork({ track }: { track: LibraryTrackSummary }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!track.artwork) {
      queueMicrotask(() => {
        if (live) setUrl(null);
      });
      return;
    }
    void resolveArtworkUrl(track.artwork)
      .then((value) => {
        if (live) setUrl(value);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [track.artwork]);
  return url ? (
    <img className="library-view__artwork" src={url} alt="" />
  ) : (
    <span className="library-view__artwork library-view__artwork--placeholder" aria-hidden="true" />
  );
}

export function LibraryView({ onOpenSettings, onPlayTrack, playbackAvailable }: LibraryViewProps) {
  const [presentation, setPresentation] = useState<"albums" | "tracks">("albums");
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<LibraryTrackSummary[]>([]);
  const [albums, setAlbums] = useState<LibraryAlbumSummary[]>([]);
  const [scan, setScan] = useState<LibraryScanSnapshot | null>(null);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [hasRoots, setHasRoots] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  useEffect(() => {
    const token = ++request.current;
    const timer = window.setTimeout(() => {
      const loadPages = async () => {
        const [nextStatus, roots] = await Promise.all([getLibraryStatus(), listLibraryRoots()]);
        const loadedTracks: LibraryTrackSummary[] = [];
        let trackCursor: string | null = null;
        do {
          const page = await listLibraryTracks(trackCursor, query);
          loadedTracks.push(...page.items);
          trackCursor = page.nextAfterId;
        } while (trackCursor);
        const loadedAlbums: LibraryAlbumSummary[] = [];
        let albumCursor: string | null = null;
        do {
          const page = await listLibraryAlbums(albumCursor, query);
          loadedAlbums.push(...page.items);
          albumCursor = page.nextAfterId;
        } while (albumCursor);
        return [nextStatus, roots, loadedTracks, loadedAlbums] as const;
      };
      void loadPages()
        .then(([nextStatus, roots, loadedTracks, loadedAlbums]) => {
          if (token !== request.current) return;
          setStatus(nextStatus);
          setHasRoots(roots.length > 0);
          setTracks(loadedTracks);
          setAlbums(loadedAlbums);
        })
        .catch(() => {
          if (token === request.current)
            setStatus({ status: "unavailable", reason: "storageUnavailable" });
        })
        .finally(() => {
          if (token === request.current) setLoading(false);
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void listenToLibraryScanProgress((snapshot) => {
      if (active) setScan(snapshot);
    }).then((fn) => {
      if (active) unsubscribe = fn;
      else fn();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const emptyMessage =
    status?.status === "unavailable"
      ? "Your library is unavailable."
      : hasRoots === false
        ? "Set up your library"
        : query.trim()
          ? "No matches"
          : "No indexed music yet";
  return (
    <section className="library-view" aria-label="Library">
      <header className="library-view__header">
        <div>
          <h1>Library</h1>
          <div className="library-view__switch" role="group" aria-label="Library presentation">
            <button
              type="button"
              className={presentation === "albums" ? "is-active" : ""}
              aria-pressed={presentation === "albums"}
              onClick={() => setPresentation("albums")}
            >
              Albums
            </button>
            <button
              type="button"
              className={presentation === "tracks" ? "is-active" : ""}
              aria-pressed={presentation === "tracks"}
              onClick={() => setPresentation("tracks")}
            >
              Tracks
            </button>
          </div>
        </div>
        <label className="library-view__search">
          <span className="sr-only">Search your library</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search your library..."
          />
        </label>
      </header>
      {scan?.state === "running" ? (
        <p className="library-view__scan">Scanning library… {scan.indexedCount} tracks indexed</p>
      ) : null}
      {loading ? (
        <p className="library-view__notice">Loading library…</p>
      ) : (presentation === "albums" ? albums.length : tracks.length) === 0 ? (
        <div className="library-view__empty">
          <p>{emptyMessage}</p>
          <button type="button" onClick={onOpenSettings}>
            Open Library settings
          </button>
        </div>
      ) : presentation === "albums" ? (
        <Albums albums={albums} />
      ) : (
        <Tracks tracks={tracks} playbackAvailable={playbackAvailable} onPlayTrack={onPlayTrack} />
      )}
    </section>
  );
}

function Albums({ albums }: { albums: LibraryAlbumSummary[] }) {
  return (
    <section>
      <h2>Albums</h2>
      <div className="library-view__album-grid">
        {albums.map((album) => (
          <article className="library-view__album" key={album.id}>
            {album.artwork ? (
              <AlbumArtwork artwork={album.artwork} />
            ) : (
              <span
                className="library-view__artwork library-view__artwork--placeholder"
                aria-hidden="true"
              />
            )}
            <h3>{album.title}</h3>
            <p>{album.albumArtist}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AlbumArtwork({ artwork }: { artwork: NonNullable<LibraryAlbumSummary["artwork"]> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resolveArtworkUrl(artwork)
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [artwork]);
  return url ? (
    <img className="library-view__artwork" src={url} alt="" />
  ) : (
    <span className="library-view__artwork library-view__artwork--placeholder" aria-hidden="true" />
  );
}

function Tracks({
  tracks,
  playbackAvailable,
  onPlayTrack,
}: {
  tracks: LibraryTrackSummary[];
  playbackAvailable: boolean;
  onPlayTrack: (id: string) => void;
}) {
  return (
    <section>
      <h2>Tracks</h2>
      <div className="library-view__tracks">
        {tracks.map((track) => (
          <article className="library-view__track" key={track.id}>
            <Artwork track={track} />
            <div>
              <h3 title={track.title}>{track.title}</h3>
              <p title={track.artist ?? undefined}>{track.artist ?? "Unknown artist"}</p>
              <small>{track.album ?? "Unknown album"}</small>
            </div>
            <button
              type="button"
              aria-label={`Play ${track.title}`}
              disabled={!playbackAvailable || !track.playable}
              onClick={() => onPlayTrack(track.id)}
            >
              Play
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
