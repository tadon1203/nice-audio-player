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
import { AlbumArtworkIdentity } from "./AlbumArtworkIdentity";
import { albumArtistIdentity } from "./library-identity";
import { useAlbumDetailQuery } from "./use-album-detail-query";

const latinMediaTitle = /^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Mark}]+$/u;
const usesCharacterTitle = (title: string) =>
  latinMediaTitle.test(title) && title.trim().split(/\s+/u).length <= 6;

export function AlbumDetailView({
  album,
  refreshKey: _refreshKey,
  playbackAvailable,
  onBack,
  onPlayAlbumTrack,
  onPlayAlbum,
  activeTrackId,
  playbackStatus,
  onOpenAlbumArtist,
  query,
}: {
  album: LibraryAlbumSummary;
  refreshKey: number;
  playbackAvailable: boolean;
  onBack: () => void;
  onPlayAlbumTrack: (albumKey: LibraryAlbumSummary["key"], trackId: string) => void;
  onPlayAlbum: (key: LibraryAlbumSummary["key"]) => void;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
  onOpenAlbumArtist?: (key: { name: string }) => void;
  query?: ReturnType<typeof useAlbumDetailQuery>;
}) {
  const fallbackQuery = useAlbumDetailQuery(album.key, _refreshKey, query === undefined, undefined);
  const activeQuery = query ?? fallbackQuery;
  const backRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const detail = activeQuery.details.value;
  const summary = detail?.summary ?? album;
  const grouped = groupTracks(activeQuery.tracks.items);
  const artworkUrl = useLibraryArtworkUrl(summary.artwork);
  useLayoutEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="album-detail page-frame" aria-label={`${summary.key.title} album detail`}>
      <div className="album-detail__content content-frame">
        <button ref={backRef} type="button" className="album-detail__back" onClick={onBack}>
          <AppIcon name="chevronLeft" /> <span>Back</span>
        </button>
        <div className="album-detail__hero">
          <AlbumArtworkIdentity
            albumId={album.key}
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
                usesCharacterTitle(summary.key.title)
                  ? "type-media-title"
                  : "type-media-title type-media-title--interface"
              }
            >
              {summary.key.title}
            </h1>
            {onOpenAlbumArtist ? (
              <button
                type="button"
                className="album-detail__artist album-detail__artist-button type-media-artist"
                data-library-focus-id={albumArtistIdentity({ name: summary.key.albumArtist })}
                onClick={() => onOpenAlbumArtist({ name: summary.key.albumArtist })}
              >
                {summary.key.albumArtist}
              </button>
            ) : (
              <p className="album-detail__artist type-media-artist">{summary.key.albumArtist}</p>
            )}
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
              onClick={() => onPlayAlbum(summary.key)}
            >
              <AppIcon name="play" /> Play album
            </Button>
          </div>
        </div>
        {activeQuery.details.error ? (
          <div className="library-view__notice" role="alert">
            {activeQuery.details.error}{" "}
            <Button type="button" onClick={activeQuery.details.retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {activeQuery.tracks.error ? (
          <div className="library-view__notice" role="alert">
            {activeQuery.tracks.error}{" "}
            <Button type="button" onClick={activeQuery.tracks.retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {activeQuery.tracks.loading && activeQuery.tracks.items.length === 0 ? (
          <p className="library-view__notice">Loading album…</p>
        ) : (
          <div className="album-detail__tracks">
            {[...grouped.entries()].map(([label, tracks]) => (
              <TrackGroup
                key={label}
                label={label}
                tracks={tracks}
                albumKey={summary.key}
                albumArtist={summary.key.albumArtist}
                playbackAvailable={playbackAvailable}
                onPlayAlbumTrack={onPlayAlbumTrack}
                activeTrackId={activeTrackId}
                playbackStatus={playbackStatus}
                hideHeading={
                  detail?.trackCount === 1 &&
                  activeQuery.tracks.items.length === 1 &&
                  activeQuery.tracks.nextOffset === null
                }
                animateRows={!reducedMotion}
              />
            ))}
            {activeQuery.tracks.nextOffset !== null ? (
              <Button
                type="button"
                variant="neutral"
                className="album-detail__load-more"
                onClick={activeQuery.tracks.loadNext}
                disabled={activeQuery.tracks.loadingNext}
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
  albumKey,
  activeTrackId,
  playbackStatus,
  hideHeading,
  animateRows,
}: {
  label: string;
  tracks: LibraryAlbumTrackSummary[];
  albumArtist: string;
  playbackAvailable: boolean;
  onPlayAlbumTrack: (albumKey: LibraryAlbumSummary["key"], trackId: string) => void;
  albumKey: LibraryAlbumSummary["key"];
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
                onClick={() => onPlayAlbumTrack(albumKey, t.id)}
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
