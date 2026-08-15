export function formatLibraryDate(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{4})(?:-\d{2}-\d{2})?(?:T.*)?$/.exec(trimmed);
  return match?.[1] ?? trimmed;
}
