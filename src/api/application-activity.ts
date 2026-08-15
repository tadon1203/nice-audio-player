import { listen } from "@tauri-apps/api/event";
import { commands } from "@/bindings";
import type { ApplicationActivity } from "@/bindings";

export function isApplicationActivity(value: unknown): value is ApplicationActivity {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.kind === "librarySync" &&
    (item.state === "running" || item.state === "attentionRequired")
  );
}

export async function getApplicationActivities(): Promise<ApplicationActivity[]> {
  const value: unknown = await commands.getApplicationActivities();
  if (!Array.isArray(value) || !value.every(isApplicationActivity))
    throw new Error("Invalid application activity payload.");
  return value;
}

export function listenToApplicationActivities(
  handler: (activities: ApplicationActivity[]) => void,
  invalidPayloadHandler?: () => void,
): Promise<() => void> {
  return listen<unknown>("application-activities-changed", ({ payload }) => {
    if (Array.isArray(payload) && payload.every(isApplicationActivity)) handler(payload);
    else invalidPayloadHandler?.();
  });
}

