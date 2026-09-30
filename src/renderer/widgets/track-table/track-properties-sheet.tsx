import type { ReactNode } from "react";
import { useLibraryTrackProperties } from "@/renderer/entities/library";
import { nativeApi } from "@/renderer/shared/lib/native";
import {
  formatAudioPath,
  formatDuration,
  formatSampleRate,
  MISSING,
} from "@/renderer/shared/lib/format";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/renderer/shared/ui/shadcn/sheet";
import type { LibraryTrackProperties } from "@/shared/ipc";

/** Everything the library knows about one track: tags, audio format, and where the file is. */
export function TrackPropertiesSheet({
  trackId,
  onClose,
}: {
  trackId: string | null;
  onClose: () => void;
}) {
  const { data: properties, isPending } = useLibraryTrackProperties(trackId);
  return (
    <Sheet open={trackId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="right" className="w-96 gap-0 p-0">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>Properties</SheetTitle>
          <SheetDescription className="truncate">
            {properties?.title ?? properties?.fileName ?? " "}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {properties ? (
            <PropertyList properties={properties} />
          ) : isPending ? null : (
            <p className="text-sm text-muted-foreground">This track is no longer in the library.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PropertyList({ properties }: { properties: LibraryTrackProperties }) {
  return (
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      <Row label="Title">{properties.title}</Row>
      <Row label="Artist">{properties.artist}</Row>
      <Row label="Album">{properties.album}</Row>
      <Row label="Album artist">{properties.albumArtist}</Row>
      <Row label="Track">{ofTotal(properties.trackNumber, properties.trackTotal)}</Row>
      <Row label="Disc">{ofTotal(properties.discNumber, properties.discTotal)}</Row>
      <Row label="Genre">{properties.genre}</Row>
      <Row label="Date">{properties.date}</Row>
      <Row label="Duration">
        {properties.durationMs === null ? null : formatDuration(properties.durationMs)}
      </Row>
      <Row label="Format">
        {formatAudioPath({
          format: properties.fileFormat,
          bitDepth: properties.bitDepth,
          sampleRate: properties.sampleRate,
          bitrateKbps: properties.bitrateKbps,
        })}
      </Row>
      <Row label="Codec">{properties.codec}</Row>
      <Row label="Sample rate">
        {properties.sampleRate === null ? null : formatSampleRate(properties.sampleRate)}
      </Row>
      <Row label="Channels">{properties.channelCount}</Row>
      <Row label="Bit depth">
        {properties.bitDepth === null ? null : `${properties.bitDepth}-bit`}
      </Row>
      <Row label="Bit rate">
        {properties.bitrateKbps === null ? null : `${properties.bitrateKbps} kbps`}
      </Row>
      <Row label="File">
        <span className="break-all">{properties.path}</span>
        <span className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(properties.path)}
          >
            Copy path
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void nativeApi().revealLibraryTrack(properties.id)}
          >
            Show in Explorer
          </Button>
        </span>
      </Row>
    </dl>
  );
}

function ofTotal(number: number | null, total: number | null) {
  if (number === null) return null;
  return total === null ? String(number) : `${number} of ${total}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 tabular-nums">
        {empty ? <span className="text-muted-foreground">{MISSING}</span> : children}
      </dd>
    </>
  );
}
