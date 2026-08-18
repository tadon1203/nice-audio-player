import { useEffect, useRef, type ReactNode } from "react";
import { ContentTransition } from "./ui/ContentTransition";

export function PlaybackContextPane({
  mode,
  onClose,
  children,
  actions,
  phase = "open",
}: {
  mode: "queue" | "lyrics";
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  phase?: "opening" | "open" | "closing";
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (phase === "open") heading.current?.focus({ preventScroll: true });
  }, [mode, phase]);
  return (
    <aside
      id="playback-context-pane"
      className="playback-context-pane"
      data-testid={mode === "queue" ? "playback-queue" : undefined}
      aria-labelledby="playback-context-title"
    >
      <header className="playback-context-pane__header">
        <h2 id="playback-context-title" ref={heading} tabIndex={-1}>
          {mode === "queue" ? "Queue" : "Lyrics"}
        </h2>
        {actions}
        <button type="button" className="playback-context-pane__close" onClick={onClose}>
          Close
        </button>
      </header>
      <ContentTransition contentKey={mode} direction="neutral">
        {children}
      </ContentTransition>
    </aside>
  );
}
