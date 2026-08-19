export function PlayingMarker({ className = "" }: { className?: string }) {
  return (
    <span className={`playing-marker${className ? ` ${className}` : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
