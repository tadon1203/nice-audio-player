import { useEffect, useRef, type ReactNode } from "react";

export function PlaybackContextPane({
  mode,
  onClose,
  children,
  actions,
}: {
  mode: "queue" | "lyrics";
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside
      id="playback-context-pane"
      data-slot="playback-context-pane"
      className="grid h-full min-h-full min-w-0 grid-rows-[auto_minmax(0,1fr)] border-s border-border-subtle bg-surface"
      data-testid={mode === "queue" ? "playback-queue" : undefined}
      aria-labelledby="playback-context-title"
    >
      <header className="flex min-w-0 items-center justify-between gap-4 border-b border-border-subtle px-6 pb-4 pt-6 short-window:px-4 short-window:pb-2 short-window:pt-3">
        <h2
          id="playback-context-title"
          className="min-w-0 text-section-title font-semibold leading-section-title text-text-primary"
        >
          {mode === "queue" ? "Queue" : "Lyrics"}
        </h2>
        {actions}
        <button
          ref={closeButton}
          type="button"
          className="min-h-10 rounded-control border border-border-control bg-transparent px-3 text-text-primary hover:bg-surface-hover"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      {children}
    </aside>
  );
}
