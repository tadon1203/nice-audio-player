import {
  ChevronLeft,
  Ellipsis,
  ListMusic,
  MonitorSpeaker,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Repeat1,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume1,
  Volume2,
  VolumeOff,
  VolumeX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SVGProps } from "react";

const icons: Record<string, LucideIcon> = {
  queue: ListMusic,
  lyrics: Music2,
  more: Ellipsis,
  shuffle: Shuffle,
  repeat: Repeat2,
  repeatOne: Repeat1,
  play: Play,
  pause: Pause,
  stop: Square,
  previous: SkipBack,
  next: SkipForward,
  volume: Volume2,
  volumeHigh: Volume2,
  volumeLow: Volume1,
  volumeSilent: VolumeOff,
  mute: VolumeX,
  refresh: RefreshCw,
  output: MonitorSpeaker,
  chevronLeft: ChevronLeft,
} as const;

export type AppIconName = keyof typeof icons;

export function AppIcon({
  name,
  size = 20,
  ...props
}: { name: AppIconName; size?: 20 | 24 } & SVGProps<SVGSVGElement>) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" focusable="false" size={size} strokeWidth={2} {...props} />;
}
