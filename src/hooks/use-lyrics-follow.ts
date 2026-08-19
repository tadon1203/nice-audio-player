import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { LyricsTimedLine } from "@/bindings";
import type { AcceptedPlaybackSeek } from "./use-seek-controller";
import { activeLyricsGroup } from "@/lib/lyrics-sync";
import { useScrollRegion } from "./use-scroll-region";

export function useLyricsFollow(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  lines: LyricsTimedLine[],
  positionMs: number,
  playbackId: string | null,
  playbackRevision: number,
  trackId: string,
  active: boolean,
  acceptedSeek: AcceptedPlaybackSeek | null,
) {
  const [following, setFollowing] = useState(true);
  const group = activeLyricsGroup(lines, positionMs);
  const groupRef = useRef(group);
  const previousGroup = useRef<{ trackId: string; key: string; ordinal: number } | null>(null);
  const initialTrack = useRef<string | null>(null);
  const consumedSeek = useRef<number | null>(null);
  const manualScrollGeneration = useRef(0);
  const cueSeekGeneration = useRef<number | null>(null);
  useLayoutEffect(() => {
    groupRef.current = group;
  }, [group]);
  const groupKey = group ? `${group.startMs}:${group.indices.join(",")}` : "none";
  const onUserScroll = useCallback(() => {
    manualScrollGeneration.current += 1;
    setFollowing(false);
  }, []);
  const { scrollToElement, setViewportElement, setContentElement } = useScrollRegion(onUserScroll);
  const targetElement = useCallback(() => {
    const current = groupRef.current;
    return !current || current.clears
      ? null
      : (scrollRef.current?.querySelector<HTMLElement>(`[data-cue-ordinal="${current.ordinal}"]`) ??
          null);
  }, [scrollRef]);
  useLayoutEffect(() => {
    if (!active || !group || !scrollRef.current) return;
    const seekIsCurrent =
      acceptedSeek !== null &&
      acceptedSeek.playbackId === playbackId &&
      acceptedSeek.acceptedRevision <= playbackRevision;
    const isNewAcceptedSeek = seekIsCurrent && acceptedSeek.id !== consumedSeek.current;
    if (initialTrack.current !== trackId) {
      initialTrack.current = trackId;
      if (seekIsCurrent) consumedSeek.current = acceptedSeek.id;
      setFollowing(true);
      const target = targetElement();
      if (target) scrollToElement(target, "center", "instant");
      previousGroup.current = { trackId, key: groupKey, ordinal: group.ordinal };
      return;
    }
    const previous = previousGroup.current;
    previousGroup.current = { trackId, key: groupKey, ordinal: group.ordinal };
    if (isNewAcceptedSeek) consumedSeek.current = acceptedSeek.id;
    const resumeFollowing =
      isNewAcceptedSeek && cueSeekGeneration.current === manualScrollGeneration.current;
    if (isNewAcceptedSeek) cueSeekGeneration.current = null;
    if (resumeFollowing) setFollowing(true);
    if (
      (!following && !resumeFollowing) ||
      !targetElement() ||
      (!isNewAcceptedSeek &&
        (!previous || previous.trackId !== trackId || previous.key === groupKey))
    )
      return;
    const ordinalDistance = Math.abs(group.ordinal - (previous?.ordinal ?? group.ordinal));
    const mode = ordinalDistance <= 1 ? "smooth" : "instant";
    scrollToElement(targetElement()!, "center", mode);
  }, [
    acceptedSeek,
    active,
    following,
    group,
    groupKey,
    playbackId,
    playbackRevision,
    scrollRef,
    scrollToElement,
    targetElement,
    trackId,
  ]);
  const returnToCurrentLine = useCallback(() => {
    setFollowing(true);
    const target = targetElement();
    if (target) scrollToElement(target, "center", "smooth");
  }, [scrollToElement, targetElement]);
  const reanchor = useCallback(() => {
    const target = targetElement();
    if (target) scrollToElement(target, "center", "instant");
  }, [scrollToElement, targetElement]);
  const revealElement = useCallback(
    (target: HTMLElement) => scrollToElement(target, "nearest", "instant"),
    [scrollToElement],
  );
  const prepareCueSeek = useCallback(() => {
    cueSeekGeneration.current = manualScrollGeneration.current;
  }, []);
  const cancelCueSeek = useCallback(() => {
    cueSeekGeneration.current = null;
  }, []);
  return {
    following,
    detached: !following,
    returnToCurrentLine,
    reanchor,
    prepareCueSeek,
    cancelCueSeek,
    revealElement,
    group,
    setViewportElement,
    setContentElement,
  };
}
