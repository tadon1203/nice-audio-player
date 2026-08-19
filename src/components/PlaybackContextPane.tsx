import { useEffect, useRef, type ReactNode } from "react";
import { ExclusiveRegion } from "./ui/ExclusiveRegion";

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
      className="playback-context-pane"
      data-testid={mode === "queue" ? "playback-queue" : undefined}
      aria-labelledby="playback-context-title"
    >
      <header className="playback-context-pane__header">
        <h2 id="playback-context-title" className="type-section-title">
          {mode === "queue" ? "Queue" : "Lyrics"}
        </h2>
        {actions}
        <button
          ref={closeButton}
          type="button"
          className="playback-context-pane__close"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <ExclusiveRegion activeKey={mode}>{children}</ExclusiveRegion>
    </aside>
  );
}
