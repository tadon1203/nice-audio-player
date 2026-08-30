import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LyricsDocument, PlaybackSnapshot } from "@/bindings";
import type { TrackLyricsState } from "@/hooks/use-track-lyrics";
import type { AcceptedPlaybackSeek } from "@/hooks/use-seek-controller";
import { useLyricsFollow } from "@/hooks/use-lyrics-follow";
import { groupTimedLyrics } from "@/lib/lyrics-sync";

interface LyricsPaneProps {
  trackTitle: string;
  trackArtist: string | null;
  trackId: string | null;
  identityPending: boolean;
  playback: PlaybackSnapshot;
  lyrics: TrackLyricsState;
  onRetry: () => void;
  canSeek: boolean;
  acceptedSeek: AcceptedPlaybackSeek | null;
  onRequestSeek: (positionMs: number) => Promise<AcceptedPlaybackSeek | null>;
}

function LyricsLines({
  document,
  trackId,
  positionMs,
  playbackId,
  playbackRevision,
  canSeek,
  acceptedSeek,
  onRequestSeek,
}: {
  document: LyricsDocument;
  trackId: string;
  positionMs: number;
  playbackId: string | null;
  playbackRevision: number;
  canSeek: boolean;
  acceptedSeek: AcceptedPlaybackSeek | null;
  onRequestSeek: (positionMs: number) => Promise<AcceptedPlaybackSeek | null>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const content = document.content;
  const timed = content.kind === "timed" ? content.lines : null;
  const cueGroups = useMemo(() => (timed ? groupTimedLyrics(timed) : []), [timed]);
  const follow = useLyricsFollow(
    scrollRef,
    timed ?? [],
    positionMs,
    playbackId,
    playbackRevision,
    trackId,
    Boolean(timed),
    acceptedSeek,
  );
  const {
    following,
    reanchor,
    group: followGroup,
    returnToCurrentLine,
    prepareCueSeek,
    cancelCueSeek,
    revealElement,
    setViewportElement,
  } = follow;
  const [rovingState, setRovingState] = useState<{ trackId: string; ordinal: number | null }>({
    trackId,
    ordinal: null,
  });
  const rovingOrdinal = rovingState.trackId === trackId ? rovingState.ordinal : null;
  const seekableGroups = useMemo(() => cueGroups.filter((cue) => !cue.clears), [cueGroups]);
  const currentSeekable = followGroup && !followGroup.clears ? followGroup.ordinal : null;
  const rovingTarget =
    rovingOrdinal !== null && seekableGroups.some((cue) => cue.ordinal === rovingOrdinal)
      ? rovingOrdinal
      : (currentSeekable ?? seekableGroups[0]?.ordinal ?? null);
  const assignViewport = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      setViewportElement(element);
    },
    [setViewportElement],
  );
  const activateCue = useCallback(
    (_ordinal: number, startMs: number) => {
      if (!canSeek) return;
      prepareCueSeek();
      void onRequestSeek(startMs).then((receipt) => {
        if (!receipt) cancelCueSeek();
      });
    },
    [cancelCueSeek, canSeek, onRequestSeek, prepareCueSeek],
  );
  const moveCueFocus = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, ordinal: number) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = seekableGroups.findIndex((cue) => cue.ordinal === ordinal);
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? seekableGroups.length - 1
            : Math.max(
                0,
                Math.min(seekableGroups.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)),
              );
      const next = seekableGroups[nextIndex];
      const button = next
        ? scrollRef.current?.querySelector<HTMLButtonElement>(
            `[data-cue-ordinal="${next.ordinal}"]`,
          )
        : null;
      if (button) {
        setRovingState({ trackId, ordinal: next.ordinal });
        button.focus({ preventScroll: true });
        revealElement(button);
      }
    },
    [revealElement, seekableGroups, trackId],
  );
  const followingRef = useRef(following);
  useLayoutEffect(() => {
    followingRef.current = following;
  }, [following]);
  useLayoutEffect(() => {
    if (!timed || !scrollRef.current) return;
    const viewport = scrollRef.current;
    let frame = 0;
    let observed = false;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!observed) {
          observed = true;
          return;
        }
        if (followingRef.current) reanchor();
      });
    });
    observer.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [reanchor, timed]);
  const lines: string[] = timed
    ? timed.map((line) => line.text)
    : content.kind === "plain"
      ? content.lines
      : [];
  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div
        className="h-full min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
        ref={assignViewport}
        data-scroll-region
      >
        <div className="mx-auto max-w-[40rem] px-6 pb-20 pt-12 short-window:pb-16 short-window:pt-6">
          {timed
            ? cueGroups.map((cue) => {
                const contentLines = cue.indices.map((index) => timed[index]!);
                const children = contentLines.map((line, index) => {
                  const sourceIndex = cue.indices[index]!;
                  const current = followGroup?.indices.includes(sourceIndex) && !followGroup.clears;
                  return (
                    <span
                      key={`${sourceIndex}-${line.text}`}
                      data-lyric-index={sourceIndex}
                      data-current={current ? "true" : undefined}
                      className="mb-1 block min-w-0 overflow-wrap-anywhere text-body-lg leading-[1.5] text-text-secondary transition-colors duration-[var(--effect-state)] ease-interface last:mb-0 data-[current=true]:font-semibold data-[current=true]:text-text-primary"
                    >
                      {line.text}
                    </span>
                  );
                });
                return !cue.clears ? (
                  <button
                    key={cue.ordinal}
                    type="button"
                    className="-ms-2 mb-4 block min-h-10 w-fit max-w-full rounded-control border-0 bg-transparent p-2 text-start hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
                    data-cue-ordinal={cue.ordinal}
                    tabIndex={canSeek && rovingTarget === cue.ordinal ? 0 : -1}
                    aria-disabled={!canSeek}
                    onFocus={() => setRovingState({ trackId, ordinal: cue.ordinal })}
                    onKeyDown={(event) => moveCueFocus(event, cue.ordinal)}
                    onClick={() => activateCue(cue.ordinal, cue.startMs)}
                  >
                    {children}
                  </button>
                ) : (
                  <div key={cue.ordinal} className="mb-4 block">
                    {children}
                  </div>
                );
              })
            : lines.map((line, index) => (
                <p
                  key={`${index}-${line}`}
                  data-lyric-index={index}
                  className="mb-4 block min-w-0 overflow-wrap-anywhere text-body-lg leading-[1.5] text-text-secondary"
                >
                  {line || "\u00a0"}
                </p>
              ))}
        </div>
      </div>
      {!following && timed ? (
        <button
          type="button"
          className="absolute bottom-6 end-6 min-h-10 rounded-control border border-border-control bg-surface-raised px-3 text-text-primary hover:bg-surface-hover"
          onClick={returnToCurrentLine}
        >
          Return to current line
        </button>
      ) : null}
    </div>
  );
}

export function LyricsPane({
  trackTitle,
  trackArtist,
  trackId,
  identityPending,
  playback,
  lyrics,
  onRetry,
  canSeek,
  acceptedSeek,
  onRequestSeek,
}: LyricsPaneProps) {
  const positionMs =
    playback.status === "playing" || playback.status === "paused" ? playback.positionMs : 0;
  const playbackId =
    playback.status === "playing" || playback.status === "paused" ? playback.playbackId : null;
  if (!playback.file)
    return (
      <p className="p-12 px-6 text-body-md text-text-secondary">Play a track to view lyrics.</p>
    );
  if (identityPending)
    return (
      <p className="p-12 px-6 text-body-md text-text-secondary" role="status">
        Finding track…
      </p>
    );
  if (!trackId)
    return (
      <p className="p-12 px-6 text-body-md text-text-secondary">
        Lyrics are available for indexed Library tracks.
      </p>
    );
  if (lyrics.kind === "loading" || lyrics.kind === "idle")
    return (
      <p className="p-12 px-6 text-body-md text-text-secondary" role="status">
        Resolving lyrics…
      </p>
    );
  if (lyrics.kind === "notFound")
    return (
      <div className="p-12 px-6 text-body-md text-text-secondary">
        <p>No lyrics found for this track.</p>
        <p>
          Place a <code>.lrc</code> file with the same filename as the audio file beside it.
        </p>
        <button
          className="min-h-10 rounded-control border border-border-control px-3 hover:bg-surface-hover"
          type="button"
          onClick={onRetry}
        >
          Retry lyrics
        </button>
      </div>
    );
  if (lyrics.kind === "sourceFailed" || lyrics.kind === "error")
    return (
      <div className="p-12 px-6 text-body-md text-error" role="alert">
        <p>
          {lyrics.kind === "error" ? lyrics.message : "Lyrics couldn't be read for this track."}
        </p>
        <button
          className="min-h-10 rounded-control border border-border-control px-3 text-text-primary hover:bg-surface-hover"
          type="button"
          onClick={onRetry}
        >
          Retry lyrics
        </button>
      </div>
    );
  const notice = lyrics.resolution.notice === "sidecarFailedUsingEmbedded";
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <div className="grid min-w-0 gap-1 px-6 pt-6 short-window:px-4 short-window:pt-3">
        <strong className="overflow-wrap-anywhere text-body-md text-text-primary">
          {trackTitle}
        </strong>
        <span className="overflow-wrap-anywhere text-caption text-text-muted">
          {trackArtist ?? " "} ·{" "}
          {lyrics.resolution.document.source === "sidecar" ? "Local LRC" : "Embedded"}
        </span>
      </div>
      {notice ? (
        <p
          className="mx-6 mt-4 rounded-control border border-border-subtle p-3 text-body-sm text-text-secondary"
          role="status"
        >
          Embedded lyrics are shown because the local .lrc file could not be read.
        </p>
      ) : null}
      <LyricsLines
        document={lyrics.resolution.document}
        trackId={trackId}
        positionMs={positionMs}
        playbackId={playbackId}
        playbackRevision={playback.revision}
        canSeek={canSeek}
        acceptedSeek={acceptedSeek}
        onRequestSeek={onRequestSeek}
      />
    </div>
  );
}
