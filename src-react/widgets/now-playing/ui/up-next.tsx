import { usePlaybackQueue } from "@/entities/playback";
import { useQueuePanelStore } from "@/features/toggle-queue-panel";
import { cn } from "@/shared/lib/utils";
import { Artwork } from "@/shared/ui/artwork";

/**
 * The next track at the end of the waveform band, close to the time axis it will follow: a
 * fixed-width slot, so the waveform's width only changes with the layout and never with the
 * queue. Opens the queue panel. Its second line gives way on a narrow layer.
 */
export function UpNext({ className }: { className?: string }) {
  const { queue } = usePlaybackQueue();
  const openQueue = useQueuePanelStore((state) => state.open);
  const next = queue?.upcoming[0];
  return (
    <button
      type="button"
      aria-label={
        next === undefined
          ? "End of queue. Open the queue"
          : `Up next: ${next.title}. Open the queue`
      }
      onClick={openQueue}
      className={cn(
        "flex w-64 shrink-0 cursor-pointer items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {next === undefined ? (
        <span className="text-sm text-muted-foreground">End of queue</span>
      ) : (
        <>
          <Artwork artwork={next.artwork} className="size-8 shrink-0 rounded-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">{next.title}</span>
            {next.artist ? (
              <span className="block truncate text-sm text-muted-foreground @max-[40rem]/npw:hidden">
                {next.artist}
              </span>
            ) : null}
          </span>
        </>
      )}
    </button>
  );
}
