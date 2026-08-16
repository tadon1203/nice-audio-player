import { useEffect, useRef, useState } from "react";
import type { ApplicationActivity } from "@/bindings";

export function ApplicationActivityIndicator({
  activity,
}: {
  activity: ApplicationActivity | null;
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
      className={`application-activity application-activity--${visible.state}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {visible.state === "running" ? "Updating library…" : "Library update needs attention"}
    </div>
  );
}
