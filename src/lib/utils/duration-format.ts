import { MISSING } from "./missing";

export class DurationFormat {
  /** Milliseconds as `m:ss` or `h:mm:ss`. */
  public static of(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return MISSING;
    const totalSeconds = Math.floor(Math.max(0, value) / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    const hours = Math.floor(minutes / 60);
    return `${hours}:${(minutes % 60).toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
}
