/** The shared visual meaning of playback time, independent of queue or lyric sequencing. */
export type TimeState = "past" | "present" | "future";

/** Readable base tones: present is brightest, future sits between it and the past. */
export function timeStateClass(state: TimeState): string {
  switch (state) {
    case "past":
      return "text-faint-foreground";
    case "present":
      return "text-foreground";
    case "future":
      return "text-muted-foreground";
  }
}
