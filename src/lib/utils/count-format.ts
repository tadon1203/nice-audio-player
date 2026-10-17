import { MISSING } from "./missing";

export class CountFormat {
  /** A count with locale grouping. */
  public static number(value: number | null | undefined): string {
    return value == null ? MISSING : value.toLocaleString();
  }

  /** A count with its noun; the singular only for exactly one. */
  public static count(
    value: number | null | undefined,
    singular: string,
    plural = `${singular}s`,
  ): string {
    return `${CountFormat.number(value)} ${value === 1 ? singular : plural}`;
  }

  /** `n of total`, `n` when the total is unknown, null when there is no number. */
  public static ofTotal(number: number | null, total: number | null): string | null {
    if (number === null) return null;
    return total === null ? String(number) : `${number} of ${total}`;
  }
}
