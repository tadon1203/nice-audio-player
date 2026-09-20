import { usePlaybackTechnicalStatus } from "@/renderer/features/playback-control";

export function PlaybackStatus() {
  const status = usePlaybackTechnicalStatus();

  return (
    <div
      role="region"
      className="grid h-full shrink-0 grid-cols-3 items-center divide-x divide-border border-t border-border bg-sidebar text-sm text-muted-foreground"
      data-slot="playback-status"
      aria-live="polite"
      aria-label="Playback signal status"
    >
      {status.map((line) => (
        <span className="min-w-0 truncate px-6" key={line.label} data-status-line={line.label}>
          <span className="text-muted-foreground">{line.label}</span>{" "}
          <span className="ms-2 tabular-nums text-muted-foreground">{line.value}</span>
        </span>
      ))}
    </div>
  );
}
