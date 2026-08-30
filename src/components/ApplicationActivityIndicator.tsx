import { useEffect, useRef, useState } from "react";
import type { ApplicationActivity } from "@/bindings";
import { Spinner } from "./ui/spinner";

export function ApplicationActivityIndicator({
  activity,
  onOpenSettings = () => undefined,
}: {
  activity: ApplicationActivity | null;
  onOpenSettings?: () => void;
}) {
  const [visible, setVisible] = useState<ApplicationActivity | null>(null);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (activity?.state === "attentionRequired") {
      shownAt.current = now;
      const timer = window.setTimeout(() => setVisible(activity), 0);
      return () => window.clearTimeout(timer);
    }
    if (activity?.state === "running") {
      if (visible?.state === "running") return;
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(activity);
      }, 400);
      return () => window.clearTimeout(timer);
    }
    if (!visible) return;
    const remaining = Math.max(0, 600 - (now - (shownAt.current ?? now)));
    const timer = window.setTimeout(() => {
      shownAt.current = null;
      setVisible(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [activity, visible]);
  if (!visible) return null;
  return (
    <div
      className={`pointer-events-auto overflow-wrap-anywhere rounded-control border border-border-subtle bg-surface-raised px-3 py-2 text-caption ${visible.state === "attentionRequired" ? "text-error" : "text-text-secondary"}`}
    >
      <div className="flex items-center gap-3" role="status" aria-live="polite" aria-atomic="true">
        {visible.state === "running" ? <Spinner /> : null}
        <span>
          {visible.state === "running" ? "Updating library…" : "Library update needs attention"}
        </span>
        {visible.state === "attentionRequired" ? (
          <button
            className="min-h-10 rounded-control border-0 bg-transparent px-2.5 text-text-primary hover:bg-surface-hover"
            type="button"
            onClick={onOpenSettings}
          >
            Open settings
          </button>
        ) : null}
      </div>
    </div>
  );
}
