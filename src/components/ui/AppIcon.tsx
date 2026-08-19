import type { ComponentProps } from "react";
import {
  Ellipsis,
  ListMusic,
  MonitorSpeaker,
  Music2,
  Play,
  RefreshCw,
  Repeat2,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  Shuffle,
  Pause,
} from "lucide-react";

const icons = {
  queue: ListMusic,
  lyrics: Music2,
  more: Ellipsis,
  shuffle: Shuffle,
  repeat: Repeat2,
  play: Play,
  pause: Pause,
  stop: Square,
  previous: SkipBack,
  next: SkipForward,
  volume: Volume2,
  mute: VolumeX,
  refresh: RefreshCw,
  output: MonitorSpeaker,
} as const;
export type AppIconName = keyof typeof icons;
export function AppIcon({
  name,
  size = 20,
  ...props
}: { name: AppIconName; size?: 20 | 24 } & ComponentProps<"svg">) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" focusable="false" size={size} strokeWidth={2} {...props} />;
}
