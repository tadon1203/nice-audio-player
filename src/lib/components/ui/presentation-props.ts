/** Presentation belongs to the shared owner, including when attributes arrive in a typed spread. */
export type PresentationProps<T> = T extends unknown
  ? Omit<T, "class" | "style"> & {
      class?: never;
      style?: never;
    }
  : never;
