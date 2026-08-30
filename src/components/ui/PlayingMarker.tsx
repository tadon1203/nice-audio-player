export function PlayingMarker() {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 flex-none items-center justify-center gap-0.5 text-text-primary"
      aria-hidden="true"
    >
      <span className="block h-1.5 w-0.5 bg-current" />
      <span className="block h-[11px] w-0.5 bg-current" />
      <span className="block h-2 w-0.5 bg-current" />
    </span>
  );
}
