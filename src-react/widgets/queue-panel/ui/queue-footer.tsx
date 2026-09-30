import { useState } from "react";
import { usePlaybackActions, usePlaybackQueue } from "@/entities/playback";
import { Button } from "@/shared/ui/shadcn/button";

/** "Clear upcoming" can be undone up to this many tracks. */
const MAX_UNDO_TRACKS = 200;

/** "Clear upcoming" while there is something upcoming, and an Undo for what it just removed. */
export function QueueFooter() {
  const { queue } = usePlaybackQueue();
  const playback = usePlaybackActions();
  const upcomingCount = queue?.upcomingCount ?? 0;
  // What "Clear upcoming" removed, so it can be put back; forgotten when the track changes.
  const currentId = queue?.current?.id;
  const [clearedState, setCleared] = useState<{ ids: string[]; forId: string | undefined }>({
    ids: [],
    forId: undefined,
  });
  const cleared = clearedState.forId === currentId ? clearedState.ids : [];

  if (queue && upcomingCount > 0) {
    return (
      <div className="border-t border-border p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => {
            // Putting tracks back is one command each, so only a short list is worth undoing.
            setCleared({
              ids:
                upcomingCount > MAX_UNDO_TRACKS
                  ? []
                  : queue.upcoming.flatMap((item) => (item.trackId ? [item.trackId] : [])),
              forId: currentId,
            });
            void playback.clearQueue();
          }}
        >
          Clear upcoming
        </Button>
      </div>
    );
  }
  if (cleared.length === 0) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 border-t border-border p-3 text-sm text-muted-foreground"
    >
      Cleared {cleared.length} {cleared.length === 1 ? "track" : "tracks"}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const restore = cleared;
          setCleared({ ids: [], forId: currentId });
          void (async () => {
            for (const trackId of restore) await playback.enqueueTrack(trackId, false);
          })();
        }}
      >
        Undo
      </Button>
    </div>
  );
}
