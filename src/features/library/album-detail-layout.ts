import { contentFrameClass } from "@/components/ui/layout";

export const albumDetailContentClass = `${contentFrameClass} [container-type:inline-size] [container-name:album-detail]`;
export const albumDetailHeroClass =
  "my-5 mb-8 grid grid-cols-1 gap-6 @min-[680px]/album-detail:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] @min-[960px]/album-detail:grid-cols-[minmax(0,360px)_clamp(24px,5cqi,96px)_minmax(0,1fr)] @min-[960px]/album-detail:gap-0";
export const albumDetailArtworkClass =
  "block max-w-[320px] overflow-hidden rounded-media @min-[960px]/album-detail:max-w-[360px]";
export const albumDetailIdentityClass =
  "min-w-0 @min-[680px]/album-detail:pt-6 @min-[960px]/album-detail:col-start-3 @min-[960px]/album-detail:pt-0";
