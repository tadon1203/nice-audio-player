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
    setContentElement,
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
    <div className="lyrics-pane__viewport">
      <div className="lyrics-pane__scroll" ref={assignViewport} data-scroll-region>
        <div className="lyrics-pane__body" ref={setContentElement}>
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
                      className={`lyrics-pane__line${current ? " is-current" : ""}`}
                    >
                      {line.text}
                    </span>
                  );
                });
                return !cue.clears ? (
                  <button
                    key={cue.ordinal}
                    type="button"
                    className="lyrics-pane__cue"
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
                  <div key={cue.ordinal} className="lyrics-pane__cue-static">
                    {children}
                  </div>
                );
              })
            : lines.map((line, index) => (
                <p key={`${index}-${line}`} data-lyric-index={index} className="lyrics-pane__line">
                  {line || "\u00a0"}
                </p>
              ))}
        </div>
      </div>
      {!following && timed ? (
        <button type="button" className="lyrics-pane__return" onClick={returnToCurrentLine}>
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
  if (!playback.file) return <p className="lyrics-pane__state">Play a track to view lyrics.</p>;
  if (identityPending)
    return (
      <p className="lyrics-pane__state" role="status">
        Finding track…
      </p>
    );
  if (!trackId)
    return <p className="lyrics-pane__state">Lyrics are available for indexed Library tracks.</p>;
  if (lyrics.kind === "loading" || lyrics.kind === "idle")
    return (
      <p className="lyrics-pane__state" role="status">
        Resolving lyrics…
      </p>
    );
  if (lyrics.kind === "notFound")
    return (
      <div className="lyrics-pane__state">
        <p>No lyrics found for this track.</p>
        <p>
          Place a <code>.lrc</code> file with the same filename as the audio file beside it.
        </p>
        <button type="button" onClick={onRetry}>
          Retry lyrics
        </button>
      </div>
    );
  if (lyrics.kind === "sourceFailed" || lyrics.kind === "error")
    return (
      <div className="lyrics-pane__state" role="alert">
        <p>
          {lyrics.kind === "error" ? lyrics.message : "Lyrics couldn't be read for this track."}
        </p>
        <button type="button" onClick={onRetry}>
          Retry lyrics
        </button>
      </div>
    );
  const notice = lyrics.resolution.notice === "sidecarFailedUsingEmbedded";
  return (
    <div className="lyrics-pane__document">
      <div className="lyrics-pane__identity">
        <strong>{trackTitle}</strong>
        <span>
          {trackArtist ?? " "} ·{" "}
          {lyrics.resolution.document.source === "sidecar" ? "Local LRC" : "Embedded"}
        </span>
      </div>
      {notice ? (
        <p className="lyrics-pane__notice" role="status">
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
