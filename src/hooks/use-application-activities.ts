import { useEffect, useMemo, useState } from "react";
import {
  getApplicationActivities,
  listenToApplicationActivities,
} from "@/api/application-activity";
import type { ApplicationActivity } from "@/bindings";

export function useApplicationActivities() {
  const [activities, setActivities] = useState<ApplicationActivity[]>([]);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const stop = await listenToApplicationActivities((next) => {
          if (!active) return;
          receivedEvent = true;
          setActivities(next);
        });
        if (!active) {
          stop();
          return;
        }
        unsubscribe = stop;
        const initial = await getApplicationActivities();
        if (active && !receivedEvent) setActivities(initial);
      } catch {
        /* This supplemental surface is intentionally fail-quiet. */
      }
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const selected = useMemo(() => {
    return activities.find((item) => item.state === "attentionRequired") ?? activities[0] ?? null;
  }, [activities]);
  return { activities, selected };
}
