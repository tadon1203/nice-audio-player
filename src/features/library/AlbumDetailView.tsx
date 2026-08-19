import { useLayoutEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { LibraryAlbumSummary, LibraryAlbumTrackSummary } from "@/bindings";
import { AppIcon } from "@/components/ui/AppIcon";
import { Button } from "@/components/ui/Button";
import { PlayingMarker } from "@/components/ui/PlayingMarker";
import { formatLongPlaybackTime, formatPlaybackTime } from "@/lib/playback-time";
import { effectsMotion } from "@/lib/motion";
import { formatLibraryDate } from "@/lib/library-date";
import { LibraryArtwork, useLibraryArtworkUrl } from "./LibraryArtwork";
import { useAlbumDetailQuery } from "./use-album-detail-query";
import { AlbumArtworkIdentity } from "./AlbumArtworkIdentity";

const latinMediaTitle = /^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Mark}]+$/u;
const usesCharacterTitle = (title: string) =>
  latinMediaTitle.test(title) && title.trim().split(/\s+/u).length <= 6;

export function AlbumDetailView({
  album,
  refreshKey,
  playbackAvailable,
  onBack,
  onPlayAlbumTrack,
  onPlayAlbum,
  activeTrackId,
  playbackStatus,
}: {
  album: LibraryAlbumSummary;
  refreshKey: number;
  playbackAvailable: boolean;
  onBack: () => void;
  onPlayAlbumTrack: (albumId: string, trackId: string) => void;
  onPlayAlbum: (id: string) => void;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const query = useAlbumDetailQuery(album.id, refreshKey, true);
  const reducedMotion = useReducedMotion();
  const detail = query.details.value;
  const summary = detail?.summary ?? album;
  const grouped = groupTracks(query.tracks.items);
  const artworkUrl = useLibraryArtworkUrl(summary.artwork);
  useLayoutEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="album-detail page-frame" aria-label={`${summary.title} album detail`}>
      <div className="album-detail__content content-frame">
        <button ref={backRef} type="button" className="album-detail__back" onClick={onBack}>
          ← <span>Back to albums</span>
        </button>
        <div className="album-detail__hero">
          <AlbumArtworkIdentity
            albumId={album.id}
            className="album-artwork-identity album-detail__artwork-wrap"
          >
            <LibraryArtwork
              artwork={summary.artwork}
              resolvedUrl={artworkUrl}
              className="album-detail__artwork"
            />
          </AlbumArtworkIdentity>
          <div className="album-detail__identity">
            <h1
              className={
                usesCharacterTitle(summary.title)
                  ? "type-media-title"
                  : "type-media-title type-media-title--interface"
              }
            >
              {summary.title}
            </h1>
            <p className="album-detail__artist type-media-artist">{summary.albumArtist}</p>
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
              <AppIcon name="play" /> Play album
            </Button>
          </div>
        </div>
        {query.details.error ? (
          <div className="library-view__notice" role="alert">
            {query.details.error}{" "}
            <Button type="button" onClick={query.details.retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {query.tracks.error ? (
          <div className="library-view__notice" role="alert">
            {query.tracks.error}{" "}
            <Button type="button" onClick={query.tracks.retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {query.tracks.loading && query.tracks.items.length === 0 ? (
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
                  detail?.trackCount === 1 &&
                  query.tracks.items.length === 1 &&
                  query.tracks.nextOffset === null
                }
                animateRows={!reducedMotion}
              />
            ))}
            {query.tracks.nextOffset !== null ? (
              <Button
                type="button"
                variant="neutral"
                className="album-detail__load-more"
                onClick={query.tracks.loadNext}
                disabled={query.tracks.loadingNext}
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
  animateRows,
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
  animateRows: boolean;
}) {
  return (
    <section className="album-detail__group">
      {hideHeading ? null : <h2 className="type-section-title">{label}</h2>}
      <ul className="album-detail__table" aria-label={label}>
        {tracks.map((t) => {
          const active =
            t.id === activeTrackId && (playbackStatus === "playing" || playbackStatus === "paused");
          return (
            <motion.li
              key={t.id}
              initial={animateRows ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={
                animateRows
                  ? { duration: effectsMotion.content, ease: effectsMotion.ease }
                  : { duration: 0 }
              }
            >
              <button
                type="button"
                className={`album-detail__row${active ? " album-detail__row--active" : ""}`}
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
                <span className="album-detail__track-number type-numeric">
                  {active ? <PlayingMarker /> : (t.trackNumber ?? "—")}
                </span>
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
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
