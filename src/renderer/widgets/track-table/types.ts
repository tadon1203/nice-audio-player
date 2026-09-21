export type TrackTableRow = {
  id: string;
  title: string;
  artist: string | null;
  album?: string | null;
  trackNumber?: number | null;
  fileFormat?: string | null;
  bitDepth?: number | null;
  sampleRate?: number | null;
  durationMs: number | null;
  availability: "available" | "missing";
  playable: boolean;
};
