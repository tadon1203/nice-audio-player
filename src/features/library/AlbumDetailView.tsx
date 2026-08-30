import { useLayoutEffect, useRef } from "react";
import type { LibraryAlbumSummary, LibraryAlbumTrackSummary } from "@/bindings";
import { AppIcon } from "@/components/ui/AppIcon";
import { Button } from "@/components/ui/button";
import { PlayingMarker } from "@/components/ui/PlayingMarker";
import { formatLongPlaybackTime, formatPlaybackTime } from "@/lib/playback-time";
import { formatLibraryDate } from "@/lib/library-date";
import { LibraryArtwork, useLibraryArtworkUrl } from "./LibraryArtwork";
import { albumArtistIdentity } from "./library-identity";
import { useAlbumDetailQuery } from "./use-album-detail-query";
import { usesCharacterTitle } from "./library-title-presentation";
import {
  albumDetailArtworkClass,
  albumDetailContentClass,
  albumDetailHeroClass,
  albumDetailIdentityClass,
} from "./album-detail-layout";

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
  const detail = activeQuery.details.value;
  const summary = detail?.summary ?? album;
  const grouped = groupTracks(activeQuery.tracks.items);
  const artworkUrl = useLibraryArtworkUrl(summary.artwork);
  useLayoutEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      className="relative isolate box-border w-full px-[var(--layout-inline-padding)] py-6 pb-[60px]"
      aria-label={`${summary.key.title} album detail`}
    >
      <div data-region="album-detail-content" className={albumDetailContentClass}>
        <button
          ref={backRef}
          type="button"
          className="min-h-10 border-0 bg-transparent p-0 text-text-secondary hover:text-text-primary"
          onClick={onBack}
        >
          <AppIcon name="chevronLeft" /> <span>Back</span>
        </button>
        <div className={albumDetailHeroClass}>
          <span data-region="album-detail-artwork" className={albumDetailArtworkClass}>
            <LibraryArtwork artwork={summary.artwork} resolvedUrl={artworkUrl} />
          </span>
          <div data-region="album-detail-identity" className={albumDetailIdentityClass}>
            <h1
              className={
                usesCharacterTitle(summary.key.title)
                  ? "font-interface text-media-artist font-regular leading-media-artist tracking-normal app-wide:font-character app-wide:text-media-title app-wide:leading-media-title app-wide:tracking-character-snug"
                  : "font-interface text-media-artist font-semibold leading-media-artist app-wide:text-media-title-interface app-wide:leading-media-title-interface"
              }
            >
              {summary.key.title}
            </h1>
            {onOpenAlbumArtist ? (
              <button
                type="button"
                className="block min-h-10 border-0 bg-transparent p-0 text-start text-media-artist font-regular leading-media-artist text-text-secondary hover:text-text-primary"
                data-library-focus-id={albumArtistIdentity({ name: summary.key.albumArtist })}
                onClick={() => onOpenAlbumArtist({ name: summary.key.albumArtist })}
              >
                {summary.key.albumArtist}
              </button>
            ) : (
              <p className="my-3 mb-5 text-media-artist font-regular leading-media-artist text-text-secondary">
                {summary.key.albumArtist}
              </p>
            )}
            <p className="min-h-6 text-body-sm text-text-secondary">
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
            <div className="mt-6">
              <Button
                type="button"
                variant="filled"
                disabled={!playbackAvailable || !detail?.firstPlayableTrackId}
                onClick={() => onPlayAlbum(summary.key)}
              >
                <AppIcon name="play" /> Play album
              </Button>
            </div>
          </div>
        </div>
        {activeQuery.details.error ? (
          <div className="my-12 text-error" role="alert">
            {activeQuery.details.error}{" "}
            <Button type="button" onClick={activeQuery.details.retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {activeQuery.tracks.error ? (
          <div className="my-12 text-error" role="alert">
            {activeQuery.tracks.error}{" "}
            <Button type="button" onClick={activeQuery.tracks.retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {activeQuery.tracks.loading && activeQuery.tracks.items.length === 0 ? (
          <p className="my-12 text-text-secondary">Loading album…</p>
        ) : (
          <div data-region="album-detail-tracks" className="w-full">
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
              />
            ))}
            {activeQuery.tracks.nextOffset !== null ? (
              <div className="my-5">
                <Button
                  type="button"
                  variant="neutral"
                  onClick={activeQuery.tracks.loadNext}
                  disabled={activeQuery.tracks.loadingNext}
                >
                  Load more
                </Button>
              </div>
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
}) {
  return (
    <section className="mt-7">
      {hideHeading ? null : (
        <h2 className="mb-2 text-section-title font-semibold leading-section-title">{label}</h2>
      )}
      <ul className="m-0 list-none border-t border-border-subtle p-0" aria-label={label}>
        {tracks.map((t) => {
          const active =
            t.id === activeTrackId && (playbackStatus === "playing" || playbackStatus === "paused");
          return (
            <li key={t.id}>
              <button
                type="button"
                data-slot="album-track-row"
                className={`grid min-h-10 w-full grid-cols-[40px_minmax(0,1fr)_64px] items-center gap-2 border-0 border-b border-border-subtle bg-transparent px-3 py-1.5 text-start text-text-primary app-wide:grid-cols-[48px_minmax(0,1fr)_72px] app-wide:gap-4 disabled:cursor-not-allowed disabled:text-text-disabled ${active ? "bg-surface-raised" : ""}`}
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
                <span
                  data-slot="album-track-number"
                  className="justify-self-center text-caption tabular-nums text-text-secondary"
                >
                  {active ? <PlayingMarker /> : (t.trackNumber ?? "—")}
                </span>
                <span className="flex min-w-0 flex-col justify-center overflow-hidden text-body-md">
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                    {t.title}
                  </span>
                  {t.artist && t.artist.trim() !== albumArtist.trim() ? (
                    <small>{t.artist}</small>
                  ) : null}
                </span>
                <span
                  data-slot="album-track-duration"
                  className="justify-self-end text-caption tabular-nums text-text-secondary"
                >
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
