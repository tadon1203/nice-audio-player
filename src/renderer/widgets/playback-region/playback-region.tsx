import { PlaybackDock } from "./playback-dock";
import { PlaybackStatus } from "./playback-status";

export function PlaybackRegion() {
  return (
    <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_24px]">
      <PlaybackDock />
      <PlaybackStatus />
    </div>
  );
}
