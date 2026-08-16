import { useEffect, useRef } from "react";
import type { LibraryAlbumSummary, LibraryAlbumTrackSummary } from "@/bindings";
import { PlayIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { formatLongPlaybackTime, formatPlaybackTime } from "@/lib/playback-time";
import { formatLibraryDate } from "@/lib/library-date";
import { LibraryArtwork, useLibraryArtworkUrl } from "./LibraryArtwork";
import { useAlbumDetailQuery } from "./use-album-detail-query";

export function AlbumDetailView({
  album,
  refreshKey,
  playbackAvailable,
  onBack,
  onPlayAlbumTrack,
  onPlayAlbum,
  activeTrackId,
  playbackStatus,
  scrollElement,
}: {
  album: LibraryAlbumSummary;
  refreshKey: number;
  playbackAvailable: boolean;
  onBack: () => void;
  onPlayAlbumTrack: (albumId: string, trackId: string) => void;
  onPlayAlbum: (id: string) => void;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
  scrollElement: HTMLElement | null;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const query = useAlbumDetailQuery(album.id, refreshKey, true);
  useEffect(() => {
    backRef.current?.focus();
    scrollElement?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [album.id, scrollElement]);
  const detail = query.details;
  const summary = detail?.summary ?? album;
  const grouped = groupTracks(query.items);
  const artworkUrl = useLibraryArtworkUrl(summary.artwork);
  return (
    <section className="album-detail" aria-label={`${summary.title} album detail`}>
      <div className="album-detail__content">
        <button ref={backRef} type="button" className="album-detail__back" onClick={onBack}>
          ← <span>Back to albums</span>
        </button>
        <div className="album-detail__hero">
          <div className="album-detail__artwork-wrap">
            <LibraryArtwork
              artwork={summary.artwork}
              resolvedUrl={artworkUrl}
              className="album-detail__artwork"
            />
          </div>
          <div className="album-detail__identity">
            <h1>{summary.title}</h1>
            <p className="album-detail__artist">{summary.albumArtist}</p>
            <p className="album-detail__meta">
              {[
                detail?.date ? formatLibraryDate(detail.date) : null,
                detail
                  ? `${detail.trackCount} ${detail.trackCount === 1 ? "track" : "tracks"}`
                  : null,
                detail?.durationMs === null
                  ? null
                  : detail?.durationMs === undefined
                    ? null
                    : formatLongPlaybackTime(detail.durationMs),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <Button
              type="button"
              variant="filled"
              className="album-detail__play"
              disabled={!playbackAvailable || !detail?.firstPlayableTrackId}
              onClick={() => onPlayAlbum(album.id)}
            >
              <PlayIcon /> Play album
            </Button>
          </div>
        </div>
        {query.error ? (
          <div className="library-view__notice" role="alert">
            {query.error}{" "}
            <button type="button" onClick={query.retry}>
              Retry
            </button>
          </div>
        ) : null}
        {query.loading && query.items.length === 0 ? (
          <p className="library-view__notice">Loading album…</p>
        ) : (
          <div className="album-detail__tracks">
            {[...grouped.entries()].map(([label, tracks]) => (
              <TrackGroup
                key={label}
                label={label}
                tracks={tracks}
                albumId={album.id}
                albumArtist={summary.albumArtist}
                playbackAvailable={playbackAvailable}
                onPlayAlbumTrack={onPlayAlbumTrack}
                activeTrackId={activeTrackId}
                playbackStatus={playbackStatus}
                hideHeading={
                  detail?.trackCount === 1 && query.items.length === 1 && query.nextOffset === null
                }
                hideTrackNumber={
                  detail?.trackCount === 1 && query.items.length === 1 && query.nextOffset === null
                }
              />
            ))}
            {query.nextOffset !== null ? (
              <Button
                type="button"
                variant="neutral"
                className="album-detail__load-more"
                onClick={query.loadNext}
                disabled={query.loadingNext}
              >
                Load more
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
function groupTracks(items: LibraryAlbumTrackSummary[]) {
  const discs = new Set(
    items.flatMap((track) => (track.discNumber === null ? [] : [track.discNumber])),
  );
  const numbered = discs.size > 1;
  const groups = new Map<string, LibraryAlbumTrackSummary[]>();
  for (const t of items) {
    const label = !numbered
      ? "Tracks"
      : t.discNumber === null
        ? "Other tracks"
        : `Disc ${t.discNumber}`;
    groups.set(label, [...(groups.get(label) ?? []), t]);
  }
  return groups;
}
function TrackGroup({
  label,
  tracks,
  albumArtist,
  playbackAvailable,
  onPlayAlbumTrack,
  albumId,
  activeTrackId,
  playbackStatus,
  hideHeading,
  hideTrackNumber,
}: {
  label: string;
  tracks: LibraryAlbumTrackSummary[];
  albumArtist: string;
  playbackAvailable: boolean;
  onPlayAlbumTrack: (albumId: string, trackId: string) => void;
  albumId: string;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
  hideHeading: boolean;
  hideTrackNumber: boolean;
}) {
  return (
    <section className="album-detail__group">
      {hideHeading ? null : <h2>{label}</h2>}
      <ul className="album-detail__table" aria-label={label}>
        {tracks.map((t) => {
          const active =
            t.id === activeTrackId && (playbackStatus === "playing" || playbackStatus === "paused");
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`${
                  hideTrackNumber
                    ? "album-detail__row album-detail__row--single"
                    : "album-detail__row"
                }${active ? " album-detail__row--active" : ""}`}
                disabled={!playbackAvailable || !t.playable}
                aria-label={`${active ? "Restart " : "Play "}${t.title} by ${t.artist ?? albumArtist}`}
                aria-description={
                  active
                    ? playbackStatus === "playing"
                      ? "Currently playing"
                      : "Currently paused"
                    : undefined
                }
                aria-current={active ? "true" : undefined}
                onClick={() => onPlayAlbumTrack(albumId, t.id)}
              >
                {hideTrackNumber ? null : (
                  <span className="album-detail__track-number type-numeric">
                    {active ? (
                      <span
                        className={`album-detail__playing-bars${playbackStatus === "playing" ? " is-playing" : ""}`}
                        aria-hidden="true"
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      (t.trackNumber ?? "—")
                    )}
                  </span>
                )}
                <span className="album-detail__track-title">
                  <span className="album-detail__track-title-main">{t.title}</span>
                  {t.artist && t.artist.trim() !== albumArtist.trim() ? (
                    <small>{t.artist}</small>
                  ) : null}
                </span>
                <span className="album-detail__duration type-numeric">
                  {t.durationMs === null ? "--:--" : formatPlaybackTime(t.durationMs)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

