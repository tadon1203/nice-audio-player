import { createContext, useContext } from "react";
import type { TrackPlaybackStatus, TrackTableLayout } from "./types";

/** Playback state and actions, read by cells so column definitions can stay static. */
export type TrackTableController = {
  layout: TrackTableLayout;
  activeTrackId: string | null;
  playbackStatus: TrackPlaybackStatus;
  onPlayTrack: (id: string) => void;
  onPauseActive?: () => void;
  onResumeActive?: () => void;
};

export const TrackTableContext = createContext<TrackTableController | null>(null);

export function useTrackTableController(): TrackTableController {
  const controller = useContext(TrackTableContext);
  if (controller === null) throw new Error("Track table cells must render inside a TrackTable");
  return controller;
}
